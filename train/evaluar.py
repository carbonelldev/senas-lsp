"""Evaluacion del clasificador de puntos para la pagina /proyecto:
validacion cruzada (10 particiones) con matriz de confusion y acierto por letra,
fondo nuevo (entrenar en un fondo, probar en el otro) y angulo nuevo simulado.
Usa el mismo tipo de modelo que entrenar_puntos.py exporto a puntos.json.

Uso: .venv/Scripts/python evaluar.py <web/public/model/puntos.json> <web/public/model/evaluacion.json>
"""
import json, os, sys, time
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from caracteristicas import aumentar, espejo, features, girar  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
MODELO, OUT = sys.argv[1], sys.argv[2]
nombre = json.load(open(MODELO))["model"]
crear = {
    "Logistic Regression": lambda: LogisticRegression(C=1.0, max_iter=5000),
    "Neural Network": lambda: MLPClassifier((128, 64), alpha=1e-3, max_iter=400, early_stopping=True, random_state=0),
}[nombre]

z = np.load(os.path.join(HERE, "cache", "puntos.npz"))
found = z["found"]
P, labels, bgs = z["pts"][found], z["labels"][found], z["backgrounds"][found]
classes = sorted(set(z["labels"]))
y = np.array([classes.index(l) for l in labels])
K_AUG = 6


def fit(idx, rng):
    Pa = aumentar(P[idx], rng, K_AUG)
    Pa = np.concatenate([Pa, espejo(Pa)])
    X = features(Pa)
    sc = StandardScaler().fit(X)
    return sc, crear().fit(sc.transform(X), np.tile(y[idx], (K_AUG + 1) * 2))


def predecir(model, Q):
    sc, clf = model
    return clf.predict(sc.transform(features(Q)))


t = time.time()
rng, rot = np.random.default_rng(0), np.random.default_rng(123)
pred_cv, pred_ang = np.zeros_like(y), np.zeros_like(y)
for tr, te in StratifiedKFold(10, shuffle=True, random_state=0).split(P, y):
    m = fit(tr, rng)
    pred_cv[te] = predecir(m, P[te])
    pred_ang[te] = predecir(m, girar(P[te], rot, roll=30, yaw=35, pitch=25))
pred_bg = np.zeros_like(y)
for b in ("library", "wall"):
    tr, te = np.where(bgs == b)[0], np.where(bgs != b)[0]
    pred_bg[te] = predecir(fit(tr, rng), P[te])

cm = np.zeros((len(classes), len(classes)), int)
for a, b in zip(y, pred_cv):
    cm[a, b] += 1
acc = lambda p: float((p == y).mean())
# fondo nuevo: media de los dos sentidos (library->wall y wall->library), igual que entrenar_puntos.py
acc_bg = float(np.mean([(pred_bg[bgs == b] == y[bgs == b]).mean() for b in ("library", "wall")]))
print(f"{nombre}: CV10 {acc(pred_cv):.4f} | fondo nuevo {acc_bg:.4f} | angulo nuevo {acc(pred_ang):.4f}  [{time.time() - t:.0f}s]")

por_letra = []
for c, letra in enumerate(classes):
    m = y == c
    tp = int(cm[c, c]); fn = int(m.sum() - tp); fp = int(cm[:, c].sum() - tp)
    conf = sorted(((classes[j], int(cm[c, j])) for j in range(len(classes)) if j != c and cm[c, j]), key=lambda x: -x[1])[:3]
    por_letra.append({
        "letra": letra, "n": int(m.sum()),
        "recall": round(tp / max(1, tp + fn), 4), "precision": round(tp / max(1, tp + fp), 4),
        "fondoNuevo": round(float((pred_bg[m] == c).mean()), 4),
        "anguloNuevo": round(float((pred_ang[m] == c).mean()), 4),
        "confundidaCon": conf,
    })

json.dump({
    "classes": classes, "n": int(len(y)), "modelo": nombre,
    "cv10": round(acc(pred_cv), 4), "fondoNuevo": round(acc_bg, 4), "anguloNuevo": round(acc(pred_ang), 4),
    "macroF1": round(float(np.mean([2 * p["precision"] * p["recall"] / max(1e-9, p["precision"] + p["recall"]) for p in por_letra])), 4),
    "matriz": cm.tolist(), "porLetra": por_letra,
    "fecha": time.strftime("%Y-%m-%d"),
}, open(OUT, "w"), separators=(",", ":"))
print("guardado", OUT)
