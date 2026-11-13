"""Entrena el clasificador de senas (misma receta que en Orange:
Regresion Logistica L2, C=1) sobre caracteristicas de MobileNetV2 y
exporta un unico modelo ONNX para el navegador.

Uso:  .venv/Scripts/python entrenar.py <carpeta data> <carpeta salida web/public/model>
"""
import csv, json, os, sys, time
import numpy as np
import onnx
import onnxruntime as ort
from onnx import helper, numpy_helper, TensorProto
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold
from sklearn.preprocessing import StandardScaler

HERE = os.path.dirname(os.path.abspath(__file__))
DATA, OUT = sys.argv[1], sys.argv[2]
FEATS_ONNX = os.path.join(HERE, "base", "features.onnx")
CACHE = os.path.join(HERE, "cache", "emb.npz")
N_AUG = 4
SIDE = 100   # resolucion del dataset; el navegador recorta y baja a esto tambien
IN = 224

# ---------- datos ----------
rows = list(csv.reader(open(os.path.join(DATA, "labels.csv"), newline="")))
assert rows[0] == ["ruta", "name", "label", "background"], rows[0]
rows = rows[3:]  # cabecera de 3 filas de Orange
paths = [os.path.join(DATA, r[0]) for r in rows]
labels = np.array([r[2] for r in rows])
backgrounds = np.array([r[3] for r in rows])
classes = sorted(set(labels))
y = np.array([classes.index(l) for l in labels])
print(f"{len(paths)} imagenes, {len(classes)} clases: {''.join(classes)}")


def to_input(img):
    img = img.convert("RGB")
    if img.size != (SIDE, SIDE):
        img = img.resize((SIDE, SIDE), Image.BILINEAR)
    return np.asarray(img.resize((IN, IN), Image.BILINEAR), np.float32)


def augment(img, rng):
    img = img.convert("RGB")
    img = img.rotate(rng.uniform(-12, 12), resample=Image.BILINEAR, fillcolor=tuple(np.asarray(img).reshape(-1, 3).mean(0).astype(int)))
    s = rng.uniform(0.72, 0.97) * SIDE
    x0, y0 = rng.uniform(0, SIDE - s), rng.uniform(0, SIDE - s)
    img = img.crop((x0, y0, x0 + s, y0 + s)).resize((SIDE, SIDE), Image.BILINEAR)
    img = ImageEnhance.Brightness(img).enhance(rng.uniform(0.65, 1.35))
    img = ImageEnhance.Contrast(img).enhance(rng.uniform(0.7, 1.3))
    img = ImageEnhance.Color(img).enhance(rng.uniform(0.6, 1.4))
    if rng.random() < 0.3:
        img = img.filter(ImageFilter.GaussianBlur(rng.uniform(0.4, 1.1)))
    return img


def embed(sess, arrays, bs=64):
    out = []
    for i in range(0, len(arrays), bs):
        out.append(sess.run(["features"], {"pixels": np.stack(arrays[i:i + bs])})[0])
    return np.concatenate(out)


if os.path.exists(CACHE):
    z = np.load(CACHE)
    E_orig, E_flip, E_aug = z["orig"], z["flip"], z["aug"]
    print("embeddings desde cache")
else:
    t = time.time()
    sess = ort.InferenceSession(FEATS_ONNX, providers=["CPUExecutionProvider"])
    rng = np.random.default_rng(0)
    imgs = [Image.open(p) for p in paths]
    sizes = {im.size for im in imgs}
    print("tamanos de imagen:", sizes)
    E_orig = embed(sess, [to_input(im) for im in imgs])
    E_flip = embed(sess, [to_input(ImageOps.mirror(im)) for im in imgs])
    E_aug = np.stack([embed(sess, [to_input(augment(im, rng)) for im in imgs]) for _ in range(N_AUG)])  # [K, N, 1280]
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    np.savez_compressed(CACHE, orig=E_orig, flip=E_flip, aug=E_aug)
    print(f"embeddings calculados en {time.time() - t:.0f}s")


def train_set(idx, aug, flip):
    X, Y = [E_orig[idx]], [y[idx]]
    if aug:
        X += [E_aug[k][idx] for k in range(N_AUG)]; Y += [y[idx]] * N_AUG
    if flip:
        X.append(E_flip[idx]); Y.append(y[idx])
    return np.concatenate(X), np.concatenate(Y)


def fit(X, Y):
    sc = StandardScaler().fit(X)
    clf = LogisticRegression(C=1.0, max_iter=3000).fit(sc.transform(X), Y)
    return sc, clf


def acc(sc, clf, idx):
    return float((clf.predict(sc.transform(E_orig[idx])) == y[idx]).mean())


def evaluate(aug, flip):
    skf = StratifiedKFold(10, shuffle=True, random_state=0)
    cv = [acc(*fit(*train_set(tr, aug, flip)), te) for tr, te in skf.split(E_orig, y)]
    bg = []
    for b in sorted(set(backgrounds)):
        tr, te = np.where(backgrounds == b)[0], np.where(backgrounds != b)[0]
        bg.append(acc(*fit(*train_set(tr, aug, flip)), te))
    return float(np.mean(cv)), bg


results = {}
for aug, flip in [(False, False), (True, False), (True, True)]:
    t = time.time()
    cv, bg = evaluate(aug, flip)
    results[(aug, flip)] = (cv, bg)
    print(f"aug={aug!s:5} flip={flip!s:5} | CV10 {cv:.3f} | fondo nuevo: "
          f"{' / '.join(f'{v:.3f}' for v in bg)} (media {np.mean(bg):.3f}) [{time.time() - t:.0f}s]")

# elegimos la configuracion que mejor generaliza a un fondo nuevo
aug, flip = max(results, key=lambda k: np.mean(results[k][1]))
print(f"configuracion elegida: aug={aug} flip={flip}")

# ---------- modelo final ----------
X, Y = train_set(np.arange(len(y)), aug, flip)
sc, clf = fit(X, Y)
W = (clf.coef_ / sc.scale_).T.astype(np.float32)                      # [1280, C]
b = (clf.intercept_ - (clf.coef_ * sc.mean_ / sc.scale_).sum(1)).astype(np.float32)

m = onnx.load(FEATS_ONNX)
g = m.graph
g.initializer.extend([numpy_helper.from_array(W, "cls_W"), numpy_helper.from_array(b, "cls_b")])
g.node.extend([
    helper.make_node("MatMul", ["features", "cls_W"], ["cls_mm"]),
    helper.make_node("Add", ["cls_mm", "cls_b"], ["logits"]),
    helper.make_node("Softmax", ["logits"], ["probs"], axis=1),
])
del g.output[:]
g.output.append(helper.make_tensor_value_info("probs", TensorProto.FLOAT, ["batch", len(classes)]))
onnx.checker.check_model(m)
os.makedirs(OUT, exist_ok=True)
onnx_path = os.path.join(OUT, "senas.onnx")
onnx.save(m, onnx_path)

# comprobar que el ONNX final da lo mismo que sklearn
sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
sample = np.arange(0, len(paths), 7)
p_onnx = sess.run(["probs"], {"pixels": np.stack([to_input(Image.open(paths[i])) for i in sample])})[0]
p_skl = clf.predict_proba(sc.transform(E_orig[sample]))
print("diferencia max ONNX vs sklearn:", float(np.abs(p_onnx - p_skl).max()),
      "| mismas predicciones:", bool((p_onnx.argmax(1) == p_skl.argmax(1)).all()))

meta = {
    "classes": classes,
    "input": {"side": SIDE, "size": IN},
    "trained": time.strftime("%Y-%m-%d"),
    "recipe": "MobileNetV2 (ImageNet) + Regresion Logistica L2 C=1",
    "augment": aug, "flip": flip,
    "cv10": round(results[(aug, flip)][0], 4),
    "newBackground": round(float(np.mean(results[(aug, flip)][1])), 4),
}
json.dump(meta, open(os.path.join(OUT, "senas.json"), "w"), indent=2)
print("guardado", onnx_path, f"{os.path.getsize(onnx_path) / 1e6:.1f} MB")
print(json.dumps(meta))
