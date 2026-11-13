import csv, os, sys, numpy as np
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
from PIL import Image, ImageOps
DATA = sys.argv[1]
rows = list(csv.reader(open(os.path.join(DATA, "labels.csv"), newline="")))[3:]
opts = vision.HandLandmarkerOptions(base_options=BaseOptions(model_asset_path="base/hand_landmarker.task"),
                                    num_hands=1, min_hand_detection_confidence=0.1, min_hand_presence_confidence=0.1)
lm = vision.HandLandmarker.create_from_options(opts)
def variants(im):
    yield "orig", im
    yield "up256", im.resize((256, 256), Image.BICUBIC)
    for p in (0.25, 0.5):
        b = int(256 * p)
        yield f"pad{p}", ImageOps.expand(im.resize((256, 256), Image.BICUBIC), border=b, fill=tuple(np.asarray(im).reshape(-1,3).mean(0).astype(int)))
sample = rows[::8]
hits = {}
for r in sample:
    im = Image.open(os.path.join(DATA, r[0])).convert("RGB")
    for name, v in variants(im):
        res = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(v)))
        hits.setdefault(name, 0); hits[name] += bool(res.hand_landmarks)
print(len(sample), {k: f"{v/len(sample):.0%}" for k, v in hits.items()})
