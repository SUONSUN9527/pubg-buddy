# PUBG Buddy — 技术方案

> 配套文档:[PRD.md](./PRD.md) · 版本 v0.1 · 2026-07-17

## 1. 总体架构

**单体桌面应用**。不搞前后端两个服务——"后端"就是 Electron 主进程里的服务层,本地单人使用,进程内调用最简单。

```
┌─────────────────────────────────────────────────────────┐
│  ow-electron 桌面应用(Overwolf 的 Electron 发行版)        │
│                                                          │
│  ┌────────────── 主进程(= 后端)──────────────────────┐  │
│  │  PubgClient      限流队列/429退避/JSON:API解析/去重   │  │
│  │  CacheService    TTL 缓存(SQLite)                   │  │
│  │  MatchPoller     60s 轮询新比赛 → 入库 → 系统通知     │  │
│  │  TelemetrySvc    下载/解析/入库(阶段三)              │  │
│  │  GepService      Overwolf 游戏事件,roster(阶段二)   │  │
│  │  OverlayManager  游戏内浮窗窗口管理(阶段二)          │  │
│  │  Db              better-sqlite3,单文件               │  │
│  └──────────────────────┬────────────────────────────────┘  │
│              typed IPC(contextBridge)                    │
│  ┌──────────────────────┴────────────────────────────────┐  │
│  │  渲染进程(= 前端)React + Vite + TS                   │  │
│  │  桌面窗口:仪表盘/查询/比赛/车队/地图编辑器/设置        │  │
│  │  overlay 窗口:控制浮窗/队友浮窗/地图浮窗(阶段二)     │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
           │                                    │
     api.pubg.com(Key 在主进程)        telemetry CDN(免限流)
```

关键决策及理由:

- **不要独立后端服务**:PRD 明确本地个人使用。Electron 主进程承担全部服务逻辑,省掉一个进程、一层 HTTP、一套部署。将来若想手机看数据,再在主进程里起一个可选的 localhost HTTP server 暴露同一服务层(预留,不做)。
- **第一天就用 ow-electron 而非普通 Electron**:它是 Electron 的直接替代品(drop-in),日常开发无差异;阶段二启用 GEP/overlay 时零迁移。需注册 Overwolf 开发者账号拿 app id(免费,本地开发模式即可用)。
- **API Key 放主进程**,渲染层永远拿不到。本地明文存储即可(PRD 非目标:复杂安全)。

## 2. 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 运行时 | ow-electron(Electron 33+)+ Node 20+ | 唯一能同时满足「桌面 App + 游戏内 overlay + GEP roster」的路线 |
| 构建 | electron-vite + @overwolf/ow-electron-builder | 官方对 electron-builder 的封装,能正确打包 ow-electron 运行时;出 NSIS 安装包 |
| 前端 | React 18 + TypeScript + Tailwind CSS + shadcn/ui | 快速出干净的数据面板;组件即拷即用 |
| 路由 | react-router(HashRouter) | Electron 文件协议下最省事 |
| 图表 | ECharts | 雷达图/热力图/K线式趋势全覆盖,中文文档好 |
| 地图 | Leaflet + CRS.Simple | 游戏地图 = 平面图片坐标系,标准做法;先 `imageOverlay` 整图,卡了再切瓦片 |
| 数据库 | better-sqlite3(同步 API,主进程) | 单文件零运维;表少,**手写 SQL + 薄 DAO**,不引 ORM |
| PUBG API | 原生 fetch 自封装 | 现成 wrapper 全是 2019 年弃坑货;自己写限流队列反而干净 |
| 状态管理 | TanStack Query(渲染层) | IPC 调用天然是异步查询,缓存/加载态/重试白送 |
| 通知/快捷键 | Electron Notification / globalShortcut | 内置能力,不加依赖 |

明确不用:ORM、Redis、Docker、Next.js、任何登录/鉴权库。

## 3. 核心设计

### 3.1 PubgClient(主进程)

```
请求 → 内存去重(相同 URL in-flight 合并)
     → 分道:限流道(令牌桶 10/min,**带优先级:用户交互 > 后台轮询/预取**,
              防止轮询器饿死正在查询的页面)
            | 免限流道(/matches、telemetry 直发)
     → fetch(Authorization: Bearer KEY, Accept: application/vnd.api+json)
     → 429:读 X-RateLimit-Reset 退避重试(最多 2 次)
     → JSON:API normalize:included[] 按 type+id 建索引,手写 ~40 行,不引库
```

用到的官方端点(shard 默认 `steam`):

| 端点 | 用途 | 限流 |
|---|---|---|
| `GET /players?filter[playerNames]=a,b,…`(≤10 个) | 名字→accountId,批量 | 计 |
| `GET /players/{id}/seasons/{seasonId}` | 单人赛季详情 | 计 |
| `GET /seasons/{seasonId}/gameMode/{mode}/players?filter[playerIds]=…`(≤10 人) | **车队/队友批量赛季数据,核心接口** | 计 |
| `GET /players/{id}/seasons/lifetime` | 生涯 | 计 |
| `GET /seasons` | 赛季列表(缓存 1 天,取 isCurrentSeason) | 计 |
| `GET /matches/{id}` | 比赛详情 | **免** |
| telemetry CDN URL(来自 match 的 asset) | 全事件流 | **免** |

### 3.2 缓存策略(CacheService,存 SQLite)

| 数据 | TTL | 说明 |
|---|---|---|
| 名字 → accountId | 7 天 | 改名才失效 |
| 赛季/生涯战绩 | 10 分钟 | 打完一局轮询器会主动刷新 |
| 赛季列表 | 1 天 | |
| 比赛详情 | ∞ | 不可变,入 `matches` 表即缓存 |
| telemetry 原始文件 | LRU | 存盘 `userData/telemetry/{matchId}.json.gz`,见 3.9 保留策略 |

赛季切换边界:若按缓存的 currentSeason 查询返回空或 404,强制刷新赛季列表后重试一次,避免赛季初拿旧 id 查空。

### 3.3 数据模型(SQLite,`PRAGMA user_version` 做迁移)

```sql
settings        (key TEXT PK, value TEXT)                      -- API Key、绑定、快捷键等
players         (account_id PK, name, shard, updated_at)       -- 名字↔ID 映射
seasons         (id PK, is_current INT, updated_at)
season_stats    (account_id, season_id, game_mode, stats_json, fetched_at,
                 PRIMARY KEY(account_id, season_id, game_mode)) -- lifetime 用 season_id='lifetime'
matches         (id PK, shard, map_name, game_mode, played_at, duration,
                 is_custom INT, telemetry_url, telemetry_path, raw_json, created_at)
match_players   (match_id, account_id, name, roster_id, team_rank,
                 kills, damage, dbnos, survive_time, win_place,
                 PRIMARY KEY(match_id, name))                   -- 从 raw_json 抽平,供列表/联查
squad_members   (id PK, name, account_id, note, sort)
map_markers     (id PK, map_id, type, x REAL, y REAL, note,
                 source TEXT CHECK(source IN ('builtin','user','telemetry')), created_at)
poll_state      (account_id PK, last_match_id, checked_at)
-- 阶段三追加:tele_deaths / tele_landings / tele_vehicle_pickups(建表时定义)
```

标记坐标统一存**世界坐标归一化值(0~1)**,渲染层按底图尺寸换算——这样同一份数据同时服务地图编辑器、游戏内地图、将来的 V2 投影。内置标记(密室/钥匙)以 seed JSON 入库,`source='builtin'`。

### 3.4 IPC 契约(preload 用 contextBridge 暴露,全部 `invoke` 化)

```ts
window.api = {
  settings: { get(), set(patch) },
  player:   { search(name), resolve(names[]) },
  stats:    { season(accountId, seasonId, mode), lifetime(accountId),
              squadCompare(accountIds[]) },
  match:    { listMine(limit), get(matchId) },
  squad:    { list(), save(member), remove(id) },
  marker:   { list(mapId), save(marker), remove(id) },
  poller:   { status(), setEnabled(bool) },
  // 主进程 → 渲染层推送(on/off 订阅):
  events:   { onNewMatch(cb), onRoster(cb) /* 阶段二 */ }
}
```

类型定义放 `src/shared/`,主进程 handler 与 preload 共用同一接口类型,编译期对齐。

### 3.5 MatchPoller

```
自适应频率:PUBG 进程运行中 60s;空闲 5min;设置页可暂停
每个周期:
  GET /players/{id}(响应自带近 14 天比赛 id 列表)→ 取最新 matchId
  ≠ poll_state.last_match_id ?
    → GET /matches/{id}(免限流)→ 入库 matches + match_players
    → (阶段三)触发 telemetry 下载
    → 主动刷新自己+车队的 season_stats 缓存
    → Notification「本局 #3,7 杀 512 伤害」→ 点击打开比赛详情页
```

每分钟成本 1 次限流请求,配额毫无压力。App 退到托盘时保持运行。

### 3.6 GepService(阶段二)

- 依赖 `@overwolf/ow-electron-packages` 的 `gep` 包,注册 PUBG(gameId 10906)
- `roster` info 覆盖**全场约 99 名玩家**(airfield 阶段陆续上报),每人含名字、队伍归属、`out` 存活标记(死亡/退出翻转)、击杀数(离场后才更新,官方防实时开挂的公平性延迟)
  - **队友浮窗(F9)**:按队伍归属筛出本队 → `stats.squadCompare` 批量查(1 次请求)→ 推送 `events.onRoster`
  - **队伍存活追踪(F21)**:进局把全员按队分组建表,订阅 `out` 翻转 → 维护各队剩余人数 → 推送 `events.onTeamAlive` → 存活面板渲染;用游戏自带总存活人数做一致性校准
- **M4 第一个 spike 的验证清单**(可配合 Overwolf 官方 Game Events Simulator):
  1. `out` 翻转时机:死亡即翻转还是有公平性延迟
  2. roster 条目中队伍字段的确切结构
  3. 蓝片召回复活(Taego/Deston)后 `out` 是否翻回 false
  4. App 中途启动(错过 airfield 阶段)时 roster 完整性——不全则 F21 降级为"仅显示已知队伍"
  - 若 `out` 延迟不可接受,F21 兜底为击杀播报区屏幕 OCR(2fps 采样,与 V2 屏幕捕获管线共用)
  - F21 仅在 squad 模式启用;duo/solo 队伍数量翻倍,面板布局与价值另议
- 兜底:启动时调 Overwolf 事件健康端点,`roster` 不健康则相关浮窗降级为手动输入
- 队友名单对局内不变,进局查一次;存活状态靠事件推送,无轮询

### 3.7 OverlayManager(阶段二)

- 依赖 `overlay` 包:游戏内三块窗口 = 三个独立 BrowserWindow(透明、无边框、可点透切换)
  - 控制浮窗:常驻,可拖动(位置存 settings),锁定后点透
  - 队友浮窗:进局自动出现,快捷键显隐
  - 地图浮窗:快捷键呼出,内容复用桌面版地图组件(同一 React 组件,路由参数区分形态)
- 快捷键经 globalShortcut 注册,可在设置页改
- overlay 包初始化失败时判空降级(只影响游戏内浮窗,桌面功能不受影响)

### 3.8 地图组件(阶段二起,全项目复用)

- Leaflet `CRS.Simple` + `L.imageOverlay`(8192px 底图,先不切瓦片)
- 图层 = 标记类型:刷车点 / 密室 / 密室钥匙 / 自定义…,每层独立开关
- 右键地图 → 屏幕坐标反算归一化世界坐标 → `marker.save`
- 底图文件放 `userData/maps/`,App 内引导用户放置(版权原因不入仓库)
- 后续叠加层直接复用:落点热力(F15)、死亡分布(F14)、刷车热度(F17)

### 3.9 Telemetry 管道(阶段三)

```
新比赛入库 → 下载 telemetry(.json.gz,存盘)
→ 流式解析,只抽关心的事件:
   LogParachuteLanding(落点) LogPlayerKillV2(击杀/死亡)
   LogPlayerTakeDamage(交火) LogVehicleRide(上车,喂 F17 聚类)
→ 聚合结果入 tele_* 表;原始文件保留,将来新分析可重放
```

磁盘保留策略:单场原始文件约 10~40MB,不加限制会无限增长。默认仅保留最近 300 场原始文件(约 5~10GB,设置页可调),超限按 LRU 清理;**聚合表永久保留**,清掉原始文件不影响已有分析。

刷车点聚类(F17):取每局前 N 分钟的 LogVehicleRide 坐标,跨几百场做网格聚类(约 50m 格),输出带频次权重的 `map_markers(source='telemetry')`。纯 SQL + 少量 TS 即可,不需要引数据科学库。

### 3.10 屏幕识别对齐 V2(阶段四,探索性)

- 屏幕捕获(Windows Graphics Capture)→ 降采样 → 判定「M 地图已打开」
- 与参考底图做特征匹配(opencv WASM 或 native binding,ORB 足够)解出缩放+平移
- 标记世界坐标 → 屏幕坐标,画在全屏透明 overlay;5~10 fps 刷新
- 点击 overlay → 逆变换 → 录入标点
- 风险最高的模块,独立于主体,失败不影响 V1

### 3.11 MCP Server(阶段四)

`@modelcontextprotocol/sdk` 起一个 stdio server,工具直接调用同一服务层:`search_player` / `get_season_stats` / `list_recent_matches` / `get_match_detail` / `query_deaths`。作为独立入口脚本打包,Claude Code 配置一行接入。

## 4. 目录结构

```
pubg-buddy/
├── docs/                      # PRD.md / TECH.md(本文档)
├── electron.vite.config.ts
├── package.json
└── src/
    ├── main/                  # 主进程(后端)
    │   ├── index.ts           # 窗口/托盘/生命周期
    │   ├── ipc.ts             # IPC handler 注册(对齐 shared 契约)
    │   ├── db/                # 连接、迁移(001_init.sql…)、DAO
    │   ├── pubg/              # client.ts 限流队列 / jsonapi.ts / types.ts
    │   ├── services/          # cache / poller / telemetry / gep / overlay
    │   └── seeds/             # 内置标记 JSON(密室/钥匙)
    ├── preload/index.ts       # contextBridge 暴露 window.api
    ├── renderer/              # 前端
    │   └── src/
    │       ├── pages/         # dashboard / search / match / squad / map-editor / settings
    │       ├── overlay/       # control-bar / teammates / map(阶段二)
    │       ├── components/    # 战绩卡片、对比表、地图组件(桌面/overlay 复用)
    │       └── lib/           # api 封装(TanStack Query hooks)
    └── shared/                # IPC 契约类型、领域类型、常量(地图尺寸表等)
```

## 5. 开发与构建

```bash
npm run dev        # electron-vite dev,热更新
npm run build      # 类型检查 + 产物
npm run dist       # electron-builder → Windows NSIS 安装包
```

- **平台:仅 Windows**。开发、调试、打包全在 Windows 游戏机上完成,`npm run dev` 起桌面窗口,阶段二起配合 PUBG 实机调 overlay/GEP(阶段一/三的纯桌面代码在其他系统也能跑,但不作为支持目标)
- 日志:electron-log 落盘(`userData/logs`);阶段二起 GEP 原始事件流单独落一份——游戏版本更新导致事件失效时,靠它诊断
- 测试:PubgClient / JSON:API normalizer 用真实 API 响应 fixture 写单测(vitest);GEP 逻辑用 Overwolf 官方 Game Events Simulator 回放调试;UI 手测,不写自动化(个人项目)
- `.env.local` 仅存开发期 API Key;运行期 Key 由设置页写入 SQLite

## 6. 风险与对策

| 风险 | 对策 |
|---|---|
| GEP roster 随游戏版本失效 | 健康端点探测 + 浮窗降级手动输入;核心查询功能不受影响 |
| better-sqlite3 ABI 与 Electron 版本 | electron-builder 自动 rebuild;package.json 锁版本组合 |
| ow-electron 文档/坑较少 | 阶段一只把它当普通 Electron 用;GEP/overlay 集中在 M4 攻坚,留缓冲 |
| PUBG 独占全屏下 overlay 可能不可见 | 引导使用"无边框窗口化"(主流玩家默认设置);M4 实测 overlay 包对独占全屏的支持 |
| 分发给朋友时 GEP/overlay 的生产权限 | ow-electron 部分能力在生产分发时需 Overwolf 注册/审核;自用 dev 模式无碍,分发前再走流程 |
| api.pubg.com 连通性(国内网络) | 失败提示中给出诊断(直连/代理);主进程支持配置 HTTP 代理 |
| 屏幕对齐(V2)不确定性 | 排在最后,独立模块,V1 已交付可用价值 |
```
