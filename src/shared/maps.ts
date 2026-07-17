/** 地图内部名 → 中文显示名;未收录的直接显示内部名 */
export const MAP_NAMES: Record<string, string> = {
  Baltic_Main: '艾伦格',
  Erangel_Main: '艾伦格(旧)',
  Desert_Main: '米拉玛',
  Savage_Main: '萨诺',
  DihorOtok_Main: '维寒迪',
  Summerland_Main: '卡拉金',
  Tiger_Main: '泰戈',
  Chimera_Main: '帕拉莫',
  Heaven_Main: '避风港',
  Kiki_Main: '帝斯顿',
  Neon_Main: '荣都',
  Range_Main: '训练场'
}

export function mapDisplayName(internal: string): string {
  return MAP_NAMES[internal] ?? internal
}

/** 比赛 gameMode 字段(比赛里可能出现活动模式,比 GAME_MODES 更宽) */
/**
 * 内部 ID → 官方 api-assets 仓库的底图文件名前缀
 * (https://github.com/pubg/api-assets 的 Assets/Maps/{name}_Main_Low_Res.png,已逐一验证存在)
 */
export const MAP_ASSET_NAMES: Record<string, string> = {
  Baltic_Main: 'Erangel',
  Erangel_Main: 'Erangel',
  Desert_Main: 'Miramar',
  Savage_Main: 'Sanhok',
  DihorOtok_Main: 'Vikendi',
  Summerland_Main: 'Karakin',
  Tiger_Main: 'Taego',
  Chimera_Main: 'Paramo',
  Heaven_Main: 'Haven',
  Kiki_Main: 'Deston',
  Neon_Main: 'Rondo',
  Range_Main: 'Camp_Jackal'
}

export function mapAssetUrl(mapId: string): string | null {
  const asset = MAP_ASSET_NAMES[mapId]
  return asset ? `https://raw.githubusercontent.com/pubg/api-assets/master/Assets/Maps/${asset}_Main_Low_Res.png` : null
}

/**
 * 各地图世界坐标边长(厘米),telemetry 坐标归一化用。
 * 采用社区通用值;若跳点热力出现整体偏移,以实测校准为准。
 */
export const MAP_WORLD_SIZE: Record<string, number> = {
  Baltic_Main: 816_000,
  Erangel_Main: 816_000,
  Desert_Main: 816_000,
  Tiger_Main: 816_000,
  Kiki_Main: 816_000,
  Neon_Main: 816_000,
  DihorOtok_Main: 612_000,
  Savage_Main: 408_000,
  Chimera_Main: 306_000,
  Summerland_Main: 204_000,
  Heaven_Main: 102_000,
  Range_Main: 204_000
}

export function modeDisplayName(gameMode: string): string {
  const base: Record<string, string> = {
    solo: '单排',
    duo: '双排',
    squad: '四排',
    'solo-fpp': '单排 FPP',
    'duo-fpp': '双排 FPP',
    'squad-fpp': '四排 FPP',
    'normal-solo': '单排',
    'normal-duo': '双排',
    'normal-squad': '四排',
    'normal-solo-fpp': '单排 FPP',
    'normal-duo-fpp': '双排 FPP',
    'normal-squad-fpp': '四排 FPP'
  }
  return base[gameMode] ?? gameMode
}
