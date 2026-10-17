// palette.js — 全片影调系统（v3，在 v2 的 60-30-10 上追加「光/空间/色彩脚本」三组 token）
//
// 保留 v2 的色板命名（60-30-10 + 语义色），因为它们已被组件/场景大量引用；
// v3 只做**追加**，不改既有 token 的值 —— 这样组件库可以逐件升级，不会牵一发动全身。
//
// 追加的三组：
//  1. 空间（floor/wall/haze…）：让「背景」从一张渐变变成一个有地面、有墙、有空气的空间。
//  2. 光（shadow/rim/glowCool…）：主体的落地影、边缘光从这取色，不再各写各的。
//  3. 色彩脚本（ACTS + SCENE_ART）：全片一层基调 + 每幕在其上做加减法。
//
// 设计依据（取证见 05_code/20261017_srt-film-art-direction/plan/findings.md）：
//  - 60-30-10 / Von Restorff：底色 60%、支撑 30%、强调 10% 且恒定；
//  - 色彩脚本：全片一层基调，按叙事段落换「调色动作」，不同段落要拉开真差距；
//  - 光是主体的一部分：每件物都有落地影、左缘边缘光、右侧压暗（统一光源）。

export const PALETTE = {
  // ---- 60% 安静底色（冷调深蓝）----
  baseTop:    '#0E1525',   // 上方更深
  baseBottom: '#1B2742',   // 下方略亮，形成柔和竖向渐变
  baseTopWarm:'#171326',   // 暖向场景用的底（更紫）
  baseBottomWarm:'#2A2140',

  // ---- 空间（v3 追加）----
  floor:      '#070C16',   // 地面（比底更暗，主体落点）
  floorLift:  '#0F1A2C',   // 地面受光带
  wall:       '#16233A',   // 墙面（实验室/室内）
  wallLit:    '#1E2E4A',   // 墙面受光侧
  haze:       'rgba(128,156,204,0.10)',  // 地平线雾（空气透视）

  // ---- 30% 支撑色（蓝灰）----
  panel:      '#243149',
  panelSoft:  '#2E3E5C',
  steel:      '#6E83A8',
  steelDim:   '#4A5D80',
  steelDeep:  '#2B3A55',   // v3：更暗的结构线（网格/柱影）
  paper:      '#E7E2D6',   // 暖纸色：物品本体
  paperShade: '#C9BFA9',   // v3：纸的暗面
  paperDark:  '#8E8470',   // v3：接触影/褶皱

  // ---- 10% 强调色（恒定暖琥珀）----
  accent:     '#FFB454',
  accentSoft: '#FFD29A',
  accentDeep: '#E8923A',

  // ---- 文字 ----
  ink:        '#EEF3FB',
  inkDim:     '#A9B6CE',
  inkFaint:   '#6E7E9C',

  // ---- 辅助语义 ----
  cool:       '#5BC8D8',
  warn:       '#E5705B',

  // ---- 光（v3 追加）----
  glow:       'rgba(255,180,84,0.16)',
  glowCool:   'rgba(110,140,190,0.16)',
  rim:        'rgba(255,214,160,0.55)',   // 暖侧边缘光
  rimCool:    'rgba(160,200,255,0.45)',   // 冷侧边缘光
  shadow:     'rgba(2,5,10,0.55)',        // 落地影
  vignette:   'rgba(4,8,16,0.55)',
};

// ---- 色彩脚本（v3）：5 个「调色动作」，按叙事段落分配 ----
// 只改底色/光池色温，不改语义色（琥珀=价值，青=得到，砖红=失去）。
export const ACTS = {
  cold:  { top: '#0B1220', bot: '#16233B', floor: '#070C16', glow: 'rgba(120,152,206,0.22)' },
  steel: { top: '#080E18', bot: '#12203A', floor: '#05090F', glow: 'rgba(108,142,192,0.18)' },
  ember: { top: '#150C12', bot: '#26172A', floor: '#0B070C', glow: 'rgba(228,113,92,0.20)' },
  warm:  { top: '#171009', bot: '#2C2118', floor: '#0C0806', glow: 'rgba(255,186,96,0.24)' },
  night: { top: '#060A12', bot: '#0B1626', floor: '#03060B', glow: 'rgba(112,142,192,0.16)' },
};

// 逐幕：调色动作 + 环境类型（背景在 backgrounds.js 里按 env 生成）
export const SCENE_ART = {
  s01: { act: 'cold',  env: 'hall' },
  s02: { act: 'cold',  env: 'hall' },
  s03: { act: 'cold',  env: 'void' },
  s04: { act: 'cold',  env: 'hall' },
  s05: { act: 'cold',  env: 'void' },
  s06: { act: 'steel', env: 'void' },
  s07: { act: 'cold',  env: 'void' },
  s08: { act: 'steel', env: 'hall' },
  s09: { act: 'steel', env: 'campus' },
  s10: { act: 'steel', env: 'lab' },
  s11: { act: 'steel', env: 'lab' },
  s12: { act: 'steel', env: 'lab' },
  s13: { act: 'steel', env: 'lab' },
  s14: { act: 'steel', env: 'lab' },
  s15: { act: 'steel', env: 'lab' },
  s16: { act: 'steel', env: 'void' },
  s17: { act: 'steel', env: 'grid' },
  s18: { act: 'steel', env: 'void' },
  s19: { act: 'cold',  env: 'void' },
  s20: { act: 'cold',  env: 'void' },
  s21: { act: 'ember', env: 'void' },
  s22: { act: 'ember', env: 'void' },
  s23: { act: 'ember', env: 'hall' },
  s24: { act: 'ember', env: 'grid' },
  s25: { act: 'steel', env: 'lab' },
  s26: { act: 'steel', env: 'lab' },
  s27: { act: 'steel', env: 'void' },
  s28: { act: 'steel', env: 'hall' },
  s29: { act: 'ember', env: 'void' },
  s30: { act: 'cold',  env: 'room' },
  s31: { act: 'cold',  env: 'room' },
  s32: { act: 'cold',  env: 'grid' },
  s33: { act: 'cold',  env: 'void' },
  s34: { act: 'cold',  env: 'grid' },
  s35: { act: 'cold',  env: 'hall' },
  s36: { act: 'warm',  env: 'room' },
  s37: { act: 'warm',  env: 'grid' },
  s38: { act: 'warm',  env: 'room' },
  s39: { act: 'warm',  env: 'void' },
  s40: { act: 'night', env: 'void' },
};

// 兼容 v2：场景段落色温（旧 backgrounds 用；新背景按 SCENE_ART 取 ACTS）
export const SCENE_TONE = {
  opening:  'cool',
  naming:   'cool',
  mug:      'cool',
  loss:     'cool',
  coase:    'cool',
  refund:   'warm',
  exp:      'neutral',
  reflect:  'warm',
  check:    'cool',
};

// 背景锚点（光池落点）：由 sceneKey 哈希从预设取，确定性、不随机。
const ANCHOR_PRESETS = [
  { x: 640, y: 300, r: 540 },
  { x: 520, y: 340, r: 480 },
  { x: 820, y: 330, r: 460 },
  { x: 460, y: 340, r: 500 },
  { x: 760, y: 320, r: 480 },
  { x: 640, y: 360, r: 520 },
];
export function anchorOf(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ANCHOR_PRESETS[h % ANCHOR_PRESETS.length];
}
export const ANCHOR = { x: 640, y: 330, r: 520 };

// 舞台几何：主体落点/地平线（背景与组件共用一套基线）
export const STAGE = {
  W: 1280,
  H: 720,
  horizon: 440,   // 远端地平线
  ground: 472,    // 主体落点（近端地面线）
};
