"""步骤1:识别每张攻略图对应的官方地图,并计算配准单应矩阵(社区图像素 → 官方图归一化坐标)"""
import cv2
import numpy as np
import json
import glob
import os

BASE = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(BASE, '..', '..', 'community-maps')
REF_DIR = os.path.join(BASE, 'refmaps')
OUT = os.path.join(BASE, 'register.json')

sift = cv2.SIFT_create(nfeatures=6000)
flann = cv2.FlannBasedMatcher({'algorithm': 1, 'trees': 5}, {'checks': 60})

# 预计算官方底图特征(统一缩放到 1024 提升特征数量)
refs = {}
for path in sorted(glob.glob(os.path.join(REF_DIR, '*.png'))):
    map_id = os.path.splitext(os.path.basename(path))[0]
    img = cv2.imread(path)
    if img is None or img.shape[0] < 200:
        print(f'!! 参考图异常跳过: {map_id} {None if img is None else img.shape}')
        continue
    scale = 1024 / max(img.shape[:2])
    resized = cv2.resize(img, None, fx=scale, fy=scale)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    kp, desc = sift.detectAndCompute(gray, None)
    refs[map_id] = {'kp': kp, 'desc': desc, 'scale': scale, 'size': resized.shape[:2]}
    print(f'参考图 {map_id}: {len(kp)} 特征')

results = {}
for path in sorted(glob.glob(os.path.join(SRC_DIR, '*.jpg')) + glob.glob(os.path.join(SRC_DIR, '*.png'))):
    name = os.path.basename(path)
    img = cv2.imread(path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    kp, desc = sift.detectAndCompute(gray, None)

    best = None
    for map_id, ref in refs.items():
        matches = flann.knnMatch(desc, ref['desc'], k=2)
        good = [m for m, n in matches if m.distance < 0.72 * n.distance]
        if len(good) < 30:
            continue
        src_pts = np.float32([kp[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
        dst_pts = np.float32([ref['kp'][m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
        H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 4.0)
        if H is None:
            continue
        inliers = int(mask.sum())
        if best is None or inliers > best['inliers']:
            # H 把社区图像素映射到 1024 缩放后的官方图像素;再除以官方图尺寸得归一化
            best = {'map': map_id, 'inliers': inliers, 'good': len(good), 'H': H.tolist(),
                    'ref_h': ref['size'][0], 'ref_w': ref['size'][1]}
    if best:
        results[name] = best
        print(f'{name} → {best["map"]}(内点 {best["inliers"]}/{best["good"]})')
    else:
        results[name] = None
        print(f'{name} → 未匹配到任何地图!')

with open(OUT, 'w') as f:
    json.dump(results, f)
print('已写出', OUT)
