"""步骤3:按人工核对的簇→类型映射提取标记,配准到官方坐标,输出 JSON + 预览图"""
import cv2
import numpy as np
import json
import os
import glob

BASE = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(BASE, '..', '..', 'community-maps')
REF_DIR = os.path.join(BASE, 'refmaps')
OUT_DIR = os.path.join(BASE, 'preview')
os.makedirs(OUT_DIR, exist_ok=True)

register = json.load(open(os.path.join(BASE, 'register.json')))

# hue 窗口(OpenCV H 0-179)。wrap=True 表示红色跨 0 环绕
W_BLUE = dict(lo=92, hi=106, s=120, v=110)
W_ORANGE = dict(lo=9, hi=17, s=150, v=140)
W_AMBER = dict(lo=18, hi=30, s=110, v=100)
W_GREEN = dict(lo=52, hi=88, s=140, v=100)
W_NAVY = dict(lo=106, hi=122, s=150, v=100)
W_RED_PIN = dict(lo=0, hi=8, s=170, v=150, wrap=True)
W_RED_ANY = dict(lo=0, hi=8, s=130, v=100, wrap=True)
W_BEAR = dict(lo=0, hi=9, s=150, v=110, wrap=True)

# 每张图:地图、{类型: (窗口, 锚点方式)}。anchor: tip=图钉底尖, center=形心
CFG = {
    '_1_': ('Baltic_Main', {'vehicle': (W_BLUE, 'tip'), 'glider': (W_ORANGE, 'tip'), 'secret_room': (W_AMBER, 'tip')}),
    '_2_': ('Tiger_Main', {'vehicle': (W_BLUE, 'tip'), 'glider': (W_ORANGE, 'tip'), 'secret_room': (W_AMBER, 'tip')}),
    '_3_': ('Desert_Main', {'vehicle': (W_BLUE, 'tip'), 'glider': (W_ORANGE, 'tip')}),
    '_4_': ('Desert_Main', {'secret_room': (W_RED_ANY, 'center')}),  # 红圈密室图
    '_5_': ('DihorOtok_Main', {'vehicle': (W_BLUE, 'tip'), 'glider': (W_ORANGE, 'tip'), 'secret_room': (W_AMBER, 'tip'),
                               'bear_cave': (W_BEAR, 'tip'), 'lab': (W_NAVY, 'tip'), 'custom': (W_GREEN, 'tip')}),
    '_6_': ('Kiki_Main', {'vehicle': (W_BLUE, 'tip'), 'glider': (W_ORANGE, 'tip'),
                          'secret_room_g': (W_GREEN, 'tip'), 'secret_room': (W_AMBER, 'tip')}),
    '_8_': ('Neon_Main', {'vehicle': (W_BLUE, 'tip'), 'glider': (W_ORANGE, 'tip')}),
    '_9_': ('Neon_Main', {'secret_room': (W_RED_ANY, 'center')}),
    '_10_': ('Chimera_Main', {'secret_room': (W_RED_PIN, 'tip')}),
    '_11_': ('Summerland_Main', {'tunnel': (W_RED_ANY, 'center')})
}
NOTE = {'custom': '绿色锤子图钉(原图未附图例)',
        'Summerland_Main:tunnel': '地下通道入口(红线标记提取,一条通道可能对应多个点)'}

def window_mask(hsv, w):
    h, s, v = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    m = (s >= w['s']) & (v >= w['v'])
    if w.get('wrap'):
        m &= (h <= w['hi']) | (h >= 174)
    else:
        m &= (h >= w['lo']) & (h <= w['hi'])
    return m.astype(np.uint8) * 255

def extract(img, w, anchor, special_dilate=False):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    mask = window_mask(hsv, w)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    if special_dilate:
        mask = cv2.dilate(mask, np.ones((7, 7), np.uint8))
    n, labels, stats, cents = cv2.connectedComponentsWithStats(mask, 8)
    comps = []
    for i in range(1, n):
        x, y, wd, hg, area = stats[i]
        if special_dilate:
            if area < 80 or area > 6000:
                continue
        else:
            if area < 200 or area > 6000 or max(wd, hg) > 110 or max(wd, hg) / max(1, min(wd, hg)) > 2.2:
                continue
        comps.append((i, x, y, wd, hg, area, cents[i]))
    if not comps:
        return []
    med_area = float(np.median([c[5] for c in comps]))
    med_h = float(np.median([c[4] for c in comps]))
    pts = []
    for i, x, y, wd, hg, area, cent in comps:
        k = max(1, min(4, round(area / med_area))) if area > 1.7 * med_area else 1
        ys, xs = np.where(labels[y:y + hg, x:x + wd] == i)
        pixels = np.stack([xs + x, ys + y], axis=1).astype(np.float32)
        if k == 1:
            groups = [pixels]
        else:
            _, lbl, _ = cv2.kmeans(pixels, k, None,
                                   (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5),
                                   4, cv2.KMEANS_PP_CENTERS)
            groups = [pixels[lbl.flatten() == g] for g in range(k)]
        for g in groups:
            if len(g) < 60:
                continue
            cx = float(np.median(g[:, 0]))
            if anchor == 'tip':
                # 图钉底尖:该组最靠下 8% 像素的中位位置
                cut = np.quantile(g[:, 1], 0.94)
                tip = g[g[:, 1] >= cut]
                pts.append((float(np.median(tip[:, 0])), float(g[:, 1].max())))
            else:
                pts.append((cx, float(np.median(g[:, 1]))))
    return pts

markers = {}  # mapId -> list of {type,x,y,note}
counts = []
for path in sorted(glob.glob(os.path.join(SRC_DIR, '*.jpg'))):
    name = os.path.basename(path)
    cfg = next((v for k, v in CFG.items() if k in name), None)
    reg = register.get(name)
    if not cfg or not reg:
        continue
    map_id, types = cfg
    assert reg['map'] == map_id, f'{name} 配准地图 {reg["map"]} 与配置 {map_id} 不一致'
    H = np.array(reg['H'])
    img = cv2.imread(path)
    for type_key, (w, anchor) in types.items():
        real_type = 'secret_room' if type_key.startswith('secret_room') else type_key
        pts = extract(img, w, anchor, special_dilate=('_11_' in name))
        src = np.array([[p] for p in pts], dtype=np.float32)
        if len(src) == 0:
            counts.append(f'{name} {type_key}: 0')
            continue
        dst = cv2.perspectiveTransform(src, H).reshape(-1, 2)
        dst[:, 0] /= reg['ref_w']
        dst[:, 1] /= reg['ref_h']
        added = 0
        for x, y in dst:
            if not (0.0 <= x <= 1.0 and 0.0 <= y <= 1.0):
                continue
            note = NOTE.get(f'{map_id}:{real_type}') or NOTE.get(real_type)
            markers.setdefault(map_id, []).append({'type': real_type, 'x': round(float(x), 4), 'y': round(float(y), 4), 'note': note})
            added += 1
        counts.append(f'{name} {type_key}: {added}')

# 同图同类型近距离去重(两张图重复标注的合并)
DEDUP = 0.012
for map_id, items in markers.items():
    kept = []
    for m in items:
        dup = next((k for k in kept if k['type'] == m['type']
                    and abs(k['x'] - m['x']) < DEDUP and abs(k['y'] - m['y']) < DEDUP), None)
        if not dup:
            kept.append(m)
    markers[map_id] = kept

with open(os.path.join(BASE, 'markers.json'), 'w', encoding='utf-8') as f:
    json.dump(markers, f, ensure_ascii=False, indent=1)

# 预览:官方底图上画点
COLORS = {'vehicle': (60, 163, 242), 'glider': (255, 163, 77), 'secret_room': (75, 83, 229),
          'bear_cave': (79, 122, 176), 'lab': (255, 124, 157), 'custom': (165, 152, 139)}
for map_id, items in markers.items():
    ref = cv2.imread(os.path.join(REF_DIR, f'{map_id}.png'))
    scale = 900 / max(ref.shape[:2])
    ref = cv2.resize(ref, None, fx=scale, fy=scale)
    hh, ww = ref.shape[:2]
    for m in items:
        c = COLORS.get(m['type'], (255, 255, 255))
        cv2.circle(ref, (int(m['x'] * ww), int(m['y'] * hh)), 7, c, 2, cv2.LINE_AA)
    cv2.imwrite(os.path.join(OUT_DIR, f'preview_{map_id}.png'), ref)

print('\n'.join(counts))
print('--- 去重后每图统计 ---')
for map_id, items in sorted(markers.items()):
    by_type = {}
    for m in items:
        by_type[m['type']] = by_type.get(m['type'], 0) + 1
    print(f'{map_id}: {by_type} 共{len(items)}')
