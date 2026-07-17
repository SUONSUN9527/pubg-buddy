"""步骤2:提取饱和色块 → 按 HSV 聚类 → 输出每簇样本拼图,供人工确认簇→标记类型的映射"""
import cv2
import numpy as np
import json
import os
import glob

BASE = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(BASE, '..', '..', 'community-maps')
OUT_DIR = os.path.join(BASE, 'clusters')
os.makedirs(OUT_DIR, exist_ok=True)

SKIP = ['_7_']  # 萨诺路线图

def blobs_of(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    mask = ((s > 110) & (v > 110)).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, 8)
    out = []
    for i in range(1, n):
        x, y, w, hgt, area = stats[i]
        if area < 120 or area > 9000 or w > 120 or hgt > 120:
            continue
        blob_mask = (labels[y:y + hgt, x:x + w] == i)
        hs = hsv[y:y + hgt, x:x + w]
        mh = np.median(hs[:, :, 0][blob_mask])
        ms = np.median(hs[:, :, 1][blob_mask])
        mv = np.median(hs[:, :, 2][blob_mask])
        fill = area / (w * hgt)
        out.append({'cx': float(centroids[i][0]), 'cy': float(centroids[i][1]),
                    'x': int(x), 'y': int(y), 'w': int(w), 'h': int(hgt),
                    'area': int(area), 'fill': round(float(fill), 2),
                    'hsv': [float(mh), float(ms), float(mv)]})
    return out

report = {}
for path in sorted(glob.glob(os.path.join(SRC_DIR, '*.jpg'))):
    name = os.path.basename(path)
    if any(k in name for k in SKIP):
        continue
    idx = name.split('_')[1]
    img = cv2.imread(path)
    blobs = blobs_of(img)
    if not blobs:
        print(f'{name}: 无色块!')
        continue

    # 按 hue 聚类(红色环绕问题:hue 转为角度向量后聚类)
    hues = np.array([b['hsv'][0] for b in blobs]) * 2 * np.pi / 180
    feats = np.stack([np.cos(hues), np.sin(hues),
                      np.array([b['hsv'][1] for b in blobs]) / 255 * 0.6,
                      np.array([b['hsv'][2] for b in blobs]) / 255 * 0.4], axis=1).astype(np.float32)
    K = min(7, len(blobs))
    _, lbl, _ = cv2.kmeans(feats, K, None,
                           (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 60, 0.5),
                           8, cv2.KMEANS_PP_CENTERS)
    lbl = lbl.flatten()

    # 每簇样本拼图:一行一个簇,最多 10 个样本
    CELL = 56
    rows = []
    stats = []
    for k in range(K):
        members = [b for b, l in zip(blobs, lbl) if l == k]
        if not members:
            continue
        med_hsv = np.median(np.array([m['hsv'] for m in members]), axis=0).round(0).tolist()
        med_area = float(np.median([m['area'] for m in members]))
        med_fill = float(np.median([m['fill'] for m in members]))
        stats.append({'cluster': k, 'count': len(members), 'hsv': med_hsv,
                      'area': med_area, 'fill': round(med_fill, 2)})
        row = np.zeros((CELL, CELL * 10, 3), np.uint8)
        for j, m in enumerate(sorted(members, key=lambda m: -m['area'])[:10]):
            cx, cy = int(m['cx']), int(m['cy'])
            crop = img[max(0, cy - 28):cy + 28, max(0, cx - 28):cx + 28]
            if crop.size == 0:
                continue
            crop = cv2.resize(crop, (CELL, CELL))
            row[:, j * CELL:(j + 1) * CELL] = crop
        label_bar = np.zeros((CELL, 130, 3), np.uint8)
        cv2.putText(label_bar, f'K{k} n={len(members)}', (4, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        cv2.putText(label_bar, f'H{int(med_hsv[0])}', (4, 46), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)
        rows.append(np.hstack([label_bar, row]))
    montage = np.vstack(rows)
    out_png = os.path.join(OUT_DIR, f'img{idx}_clusters.png')
    cv2.imwrite(out_png, montage)

    # 保存 blob + 簇标签供步骤3使用
    for b, l in zip(blobs, lbl):
        b['cluster'] = int(l)
    report[name] = {'blobs': blobs, 'stats': stats}
    print(f'{name}: {len(blobs)} 色块 → {len(stats)} 簇 → {out_png}')
    for s in stats:
        print(f"   K{s['cluster']}: n={s['count']} H={s['hsv'][0]:.0f} S={s['hsv'][1]:.0f} V={s['hsv'][2]:.0f} area={s['area']:.0f} fill={s['fill']}")

with open(os.path.join(BASE, 'blobs.json'), 'w') as f:
    json.dump(report, f)
print('已写出 blobs.json')
