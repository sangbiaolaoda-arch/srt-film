// backgrounds.js — 逐幕环境（v3）
//
// 旧版问题（取证）：40 幕共用同一张竖向渐变，只换色温与光池位置 —— 背景层在重演
// 「十二张都一样」。v3 把背景拆成两个正交维度：
//   env 决定空间结构（厅堂/实验室/校园/深空/透视网格/房间），
//   act 决定色温（cold/steel/ember/warm/night）。
// 每张背景固定五层，给主体制造纵深：底色 → 光池 → 结构剪影（远/近）→ 地面+雾+脚下光池 → 暗角。
//
// 硬约束：纯 SVG、无外链、无随机数；id 带 sceneKey 前缀（同屏 40 幕共存）。

import { PALETTE, ACTS, SCENE_ART, anchorOf, STAGE } from './palette.js';

const { W, H, horizon, ground } = STAGE;

function actOf(key) {
  return ACTS[(SCENE_ART[key] && SCENE_ART[key].act) || 'cold'] || ACTS.cold;
}
function envOf(key) {
  return (SCENE_ART[key] && SCENE_ART[key].env) || 'void';
}

/** 通用外壳：底色 + 光池 + 雾 + 暗角。 */
function shell(key, act, a) {
  return `
    <defs>
      <linearGradient id="bgGrad-${key}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${act.top}"/>
        <stop offset="0.58" stop-color="${act.bot}"/>
        <stop offset="1" stop-color="${act.floor}"/>
      </linearGradient>
      <radialGradient id="bgGlow-${key}" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="${act.glow}"/>
        <stop offset="0.55" stop-color="${act.glow}" stop-opacity="0.4"/>
        <stop offset="1" stop-color="${act.glow}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="bgHaze-${key}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${PALETTE.haze}" stop-opacity="0"/>
        <stop offset="0.5" stop-color="${PALETTE.haze}" stop-opacity="1"/>
        <stop offset="1" stop-color="${PALETTE.haze}" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="bgFloor-${key}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${act.floor}" stop-opacity="0"/>
        <stop offset="0.22" stop-color="${act.floor}" stop-opacity="0.75"/>
        <stop offset="1" stop-color="${act.floor}" stop-opacity="0.96"/>
      </linearGradient>
      <radialGradient id="bgVig-${key}" cx="0.5" cy="0.46" r="0.72">
        <stop offset="0.5" stop-color="#000" stop-opacity="0"/>
        <stop offset="1" stop-color="${PALETTE.vignette}"/>
      </radialGradient>
    </defs>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#bgGrad-${key})"/>
    <ellipse cx="${a.x}" cy="${a.y}" rx="${a.r}" ry="${a.r * 0.58}" fill="url(#bgGlow-${key})"/>
    ${dust(key, a)}`;
}

/** 空气里的微尘：确定性哈希取位置，只落在光池附近，给空镜一点「空气」。 */
function dust(key, a) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const rnd = () => { h = (h * 1103515245 + 12345) >>> 0; return (h % 1000) / 1000; };
  let out = '';
  for (let i = 0; i < 26; i++) {
    const ang = rnd() * Math.PI * 2;
    const rad = Math.sqrt(rnd()) * a.r * 0.9;
    const x = a.x + Math.cos(ang) * rad;
    const y = a.y + Math.sin(ang) * rad * 0.62;
    const r = 0.8 + rnd() * 1.8;
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="${PALETTE.paper}" opacity="${(0.05 + rnd() * 0.12).toFixed(2)}"/>`;
  }
  return out;
}

/** 地面：渐变过渡（不是一条硬边）+ 地平线雾 + 主体脚下的光池。 */
function groundPlate(key, act, a) {
  return `
    <rect x="0" y="${horizon}" width="${W}" height="${H - horizon}" fill="url(#bgFloor-${key})"/>
    <rect x="0" y="${horizon}" width="${W}" height="${H - horizon}" fill="url(#bgGlow-${key})" opacity="0.35"/>
    <ellipse cx="${a.x}" cy="${ground + 26}" rx="${a.r * 0.72}" ry="${a.r * 0.14}" fill="${act.glow}"
      opacity="0.55" filter="url(#blurLg)"/>
    <rect x="0" y="${horizon - 34}" width="${W}" height="68" fill="url(#bgHaze-${key})"/>
    <line x1="0" y1="${horizon}" x2="${W}" y2="${horizon}" stroke="${PALETTE.steelDeep}" stroke-opacity="0.45" stroke-width="1.2"/>
    <line x1="0" y1="${ground}" x2="${W}" y2="${ground}" stroke="${PALETTE.steelDeep}" stroke-opacity="0.18" stroke-width="1"/>`;
}

/** 厅堂：远处柱列 + 拱门剪影（两层），空间最深。 */
function hall() {
  const far = [];
  for (let i = 0; i < 6; i++) {
    const x = 120 + i * 212;
    far.push(`<rect x="${x}" y="${horizon - 230}" width="46" height="230" fill="${PALETTE.steelDeep}" opacity="0.16"/>`);
    far.push(`<rect x="${x - 8}" y="${horizon - 242}" width="62" height="14" rx="3" fill="${PALETTE.steelDeep}" opacity="0.2"/>`);
  }
  const arch = `<path d="M500 ${horizon} L500 ${horizon - 210} Q640 ${horizon - 320} 780 ${horizon - 210} L780 ${horizon} Z"
    fill="none" stroke="${PALETTE.steelDeep}" stroke-width="3" opacity="0.38"/>`;
  return far.join('') + arch;
}

/** 实验室：高窗 + 斜光柱 + 长桌剪影。 */
function lab() {
  const shafts = [0, 1, 2].map((i) => {
    const x = 210 + i * 300;
    return `<polygon points="${x},${96} ${x + 96},${96} ${x + 206},${horizon + 30} ${x + 64},${horizon + 30}"
      fill="${PALETTE.paper}" opacity="0.04"/>`;
  }).join('');
  const windows = [0, 1, 2].map((i) => {
    const x = 210 + i * 300;
    return `<rect x="${x}" y="96" width="96" height="250" rx="6" fill="${PALETTE.wallLit}" opacity="0.32"/>
      <rect x="${x}" y="96" width="96" height="250" rx="6" fill="none" stroke="${PALETTE.steelDeep}" stroke-width="2" opacity="0.6"/>
      <line x1="${x + 48}" y1="96" x2="${x + 48}" y2="346" stroke="${PALETTE.steelDeep}" stroke-width="2" opacity="0.5"/>`;
  }).join('');
  const bench = `<rect x="0" y="${horizon - 30}" width="${W}" height="30" fill="${PALETTE.panel}" opacity="0.32"/>
    <rect x="0" y="${horizon - 36}" width="${W}" height="7" fill="${PALETTE.steelDeep}" opacity="0.5"/>`;
  return windows + shafts + bench;
}

/** 校园：天空 + 多层柱廊剪影 + 台基。 */
function campus() {
  const cols = (x0, y0, count, w, gap, h, op) => {
    let s = '';
    for (let i = 0; i < count; i++) {
      const x = x0 + i * (w + gap);
      s += `<rect x="${x}" y="${y0 - h}" width="${w}" height="${h}" fill="${PALETTE.steelDeep}" opacity="${op}"/>`;
      s += `<rect x="${x - 5}" y="${y0 - h - 10}" width="${w + 10}" height="10" rx="2" fill="${PALETTE.steelDeep}" opacity="${op + 0.03}"/>`;
    }
    return s;
  };
  return `<rect x="0" y="0" width="${W}" height="${horizon}" fill="${PALETTE.baseBottom}" opacity="0.45"/>
    <polygon points="300,${horizon - 190} 640,${horizon - 286} 980,${horizon - 190}" fill="${PALETTE.steelDeep}" opacity="0.2"/>
    ${cols(330, horizon - 6, 6, 26, 46, 140, 0.17)}
    ${cols(300, horizon, 7, 34, 66, 196, 0.25)}
    <rect x="280" y="${horizon}" width="720" height="13" fill="${PALETTE.steelDeep}" opacity="0.34"/>`;
}

/** 透视网格：理性/图表段。极淡，别抢数据。 */
function grid() {
  let lines = '';
  for (let i = 0; i <= 12; i++) {
    const x = 640 + (i - 6) * 150;
    lines += `<line x1="${x}" y1="${horizon}" x2="${640 + (i - 6) * 420}" y2="${H}" stroke="${PALETTE.steelDeep}" stroke-width="1" opacity="0.28"/>`;
  }
  for (let i = 1; i <= 7; i++) {
    const t = i / 7;
    const y = horizon + Math.pow(t, 1.7) * (H - horizon);
    lines += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${PALETTE.steelDeep}" stroke-width="1" opacity="${0.1 + 0.14 * t}"/>`;
  }
  return lines;
}

/** 房间：墙面 + 右侧窗 + 桌面剪影。 */
function room() {
  return `<rect x="0" y="80" width="${W}" height="${horizon - 80}" fill="${PALETTE.wall}" opacity="0.42"/>
    <rect x="880" y="110" width="300" height="290" rx="4" fill="${PALETTE.wallLit}" opacity="0.26"/>
    <rect x="880" y="110" width="300" height="290" rx="4" fill="none" stroke="${PALETTE.steelDeep}" stroke-width="3" opacity="0.5"/>
    <line x1="1030" y1="110" x2="1030" y2="400" stroke="${PALETTE.steelDeep}" stroke-width="3" opacity="0.4"/>
    <polygon points="880,400 1180,400 1180,560 700,560" fill="${PALETTE.paper}" opacity="0.03"/>
    <rect x="0" y="${horizon - 10}" width="${W}" height="16" fill="${PALETTE.panel}" opacity="0.5"/>`;
}

/** 深空：只有光池与两条极淡同心弧，最安静。 */
function voidEnv(a) {
  return `<ellipse cx="${a.x}" cy="${a.y}" rx="${a.r * 1.5}" ry="${a.r * 0.9}" fill="none"
      stroke="${PALETTE.steelDeep}" stroke-width="1" opacity="0.1"/>
    <ellipse cx="${a.x}" cy="${a.y}" rx="${a.r * 1.9}" ry="${a.r * 1.12}" fill="none"
      stroke="${PALETTE.steelDeep}" stroke-width="1" opacity="0.07"/>`;
}

const ENV_FN = { hall, lab, campus, grid, room, void: voidEnv };

export function backgroundSVG(sceneKey) {
  const act = actOf(sceneKey);
  const env = envOf(sceneKey);
  const a = anchorOf(sceneKey);
  const body = (ENV_FN[env] || voidEnv)(a);
  return shell(sceneKey, act, a) + body + groundPlate(sceneKey, act, a)
    + `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#bgVig-${sceneKey})"/>`;
}
