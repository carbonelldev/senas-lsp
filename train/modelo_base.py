"""Convierte MobileNetV2 (ImageNet) en un extractor de caracteristicas.

Entrada  "pixels":   float32 [N, 224, 224, 3], RGB en 0..255 (igual que un canvas)
Salida   "features": float32 [N, 1280]

La normalizacion de ImageNet va dentro del grafo, asi Python y el navegador
solo tienen que pasar los pixeles tal cual.
"""
import os
import numpy as np
import onnx
from onnx import helper, numpy_helper, TensorProto

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "base", "mobilenetv2-12.onnx")
DST = os.path.join(HERE, "base", "features.onnx")
FEAT_NODE = "472"  # salida del GlobalAveragePool aplanada (1280)

m = onnx.load(SRC)
g = m.graph

# quitar la capa final de ImageNet (Gemm)
gemm = [n for n in g.node if n.op_type == "Gemm"]
assert len(gemm) == 1 and gemm[0].input[0] == FEAT_NODE
g.node.remove(gemm[0])
for name in gemm[0].input[1:]:
    init = next(i for i in g.initializer if i.name == name)
    g.initializer.remove(init)

# nueva entrada NHWC 0..255 -> NCHW normalizado
old_in = next(i for i in g.input if i.name == "input")
g.input.remove(old_in)
g.input.insert(0, helper.make_tensor_value_info("pixels", TensorProto.FLOAT, ["batch", 224, 224, 3]))
mean = np.array([0.485, 0.456, 0.406], np.float32).reshape(1, 3, 1, 1) * 255
inv_std = 1 / (np.array([0.229, 0.224, 0.225], np.float32).reshape(1, 3, 1, 1) * 255)
g.initializer.extend([
    numpy_helper.from_array(mean, "pre_mean"),
    numpy_helper.from_array(inv_std.astype(np.float32), "pre_inv_std"),
])
pre = [
    helper.make_node("Transpose", ["pixels"], ["pre_nchw"], perm=[0, 3, 1, 2]),
    helper.make_node("Sub", ["pre_nchw", "pre_mean"], ["pre_centered"]),
    helper.make_node("Mul", ["pre_centered", "pre_inv_std"], ["input"]),
]
for i, n in enumerate(pre):
    g.node.insert(i, n)

g.node.append(helper.make_node("Identity", [FEAT_NODE], ["features"]))
del g.output[:]
g.output.append(helper.make_tensor_value_info("features", TensorProto.FLOAT, ["batch", 1280]))

onnx.checker.check_model(m)
onnx.save(m, DST)
print("guardado", DST)
