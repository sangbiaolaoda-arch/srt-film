// backgrounds.js — 构图化"安静背景"
// 研究结论落地：
//  - 负空间 = 让主体呼吸，背景要"安静"，不堆满 competing focal points
//  - 60% 安静底色 + 单一柔和锚点（anchor）+ 暗角，制造纵深而不喧宾夺主
//  - 冷暖分工：冷调显专业信任；关键转折场景轻微偏暖
// 每个场景只换渐变色温 + 锚点位置，不引入第二、第三个视觉重心。

import { PALETTE, SCENE_TONE, ANCHOR } from './palette.js';

const DEFS = {
  cool:   { top: PALETTE.baseTop,    bot: PALETTE.baseBottom,   glow: 'rgba(110,131,168,0.10)' },
  warm:   { top: PALETTE.baseTopWarm,bot: PALETTE.baseBottomWarm,glow: 'rgba(255,180,84,0.13)' },
  neutral:{ top: '#121A2C',          bot: '#222E48',            glow: 'rgba(140,150,180,0.11)' },
};

// 锚点位置随场景轮换（引导视线，但不跳脱）：由 key 哈希从 6 个预设中取
const ANCHOR_PRESETS = [
  { x: 640, y: 300, r: 540 },
  { x: 520, y: 340, r: 480 },
  { x: 820, y: 330, r: 460 },
  { x: 460, y: 340, r: 500 },
  { x: 760, y: 320, r: 480 },
  { x: 640, y: 360, r: 520 },
];
function anchorOf(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ANCHOR_PRESETS[h % ANCHOR_PRESETS.length];
}

// 色温按叙事段落分配：自我反思段（s36-38）转暖，中性段点缀，其余冷调
const TONE_BY_KEY = {
  s08: 'neutral', s19: 'neutral', s27: 'neutral', s34: 'neutral', s35: 'neutral',
  s30: 'warm', s36: 'warm', s37: 'warm', s38: 'warm',
};

export function backgroundSVG(sceneKey) {
  const tone = TONE_BY_KEY[sceneKey] || 'cool';
  const d = DEFS[tone];
  const a = anchorOf(sceneKey);
  const id = sceneKey;
  return `
  <defs>
    <linearGradient id="bgGrad-${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${d.top}"/>
      <stop offset="1" stop-color="${d.bot}"/>
    </linearGradient>
    <radialGradient id="bgGlow-${id}" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${d.glow}"/>
      <stop offset="0.6" stop-color="rgba(0,0,0,0)"/>
      <stop offset="1" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>
    <radialGradient id="bgVig-${id}" cx="0.5" cy="0.46" r="0.75">
      <stop offset="0.55" stop-color="rgba(0,0,0,0)"/>
      <stop offset="1" stop-color="${PALETTE.vignette}"/>
    </radialGradient>
  </defs>
  <!-- 60% 安静底色 -->
  <rect x="0" y="0" width="1280" height="720" fill="url(#bgGrad-${id})"/>
  <!-- 单一柔和锚点：制造纵深，不抢主体 -->
  <ellipse class="bg-glow" cx="${a.x}" cy="${a.y}" rx="${a.r}" ry="${a.r*0.62}" fill="url(#bgGlow-${id})"/>
  <!-- 极淡地平线，给构图一个"地面"，让主体有落点 -->
  <line x1="120" y1="612" x2="1160" y2="612" stroke="${PALETTE.steelDim}" stroke-opacity="0.18" stroke-width="1.2"/>
  <!-- 暗角收边 -->
  <rect x="0" y="0" width="1280" height="720" fill="url(#bgVig-${id})"/>
  `;
}
