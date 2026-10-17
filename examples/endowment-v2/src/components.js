// components.js — SVG 组件库（每个组件锚定于槽位中心 (x,y)，宽高受 layout.SLOTS 约束）
// 研究依据（2026-10-17 联网查证）：区域划分预防 → AABB 碰撞检测兜底 → 检测结果写回布局。
// 每个组件 = 一个 .part（一个视觉单元），碰撞验收按 part 包围盒两两测。

import { PALETTE } from './palette.js';

const FONT = 'font-family="Microsoft YaHei, Noto Sans SC, PingFang SC, sans-serif"';

function txt(x, y, s, { size = 26, fill = PALETTE.ink, anchor = 'middle', weight = 400, spacing = 0, opacity = 1 } = {}) {
  return `<text x="${x}" y="${y}" ${FONT} font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" opacity="${opacity}" letter-spacing="${spacing}">${s}</text>`;
}
const P = (enter) => `class="part" data-enter="${enter || 'fade'}"`;

// ---- 人物剪影（高约 190）；enter=null 时输出普通 <g>（供复合组件内部使用，避免嵌套 part）----
// 风格化（2026-10-17 描边风技法查证）：右下暗面块 + 左上高光，统一光源
export function person(x, y, { enter = 'up', fill = PALETTE.steel, s = 1 } = {}) {
  const open = enter ? `<g ${P(enter)}>` : '<g>';
  return `${open}
    <circle cx="${x}" cy="${y - 72 * s}" r="${30 * s}" fill="${fill}"/>
    <path d="M${x - 36 * s} ${y - 26 * s} q${36 * s} ${-22 * s} ${72 * s} 0 l${7 * s} ${100 * s} q${-43 * s} ${15 * s} ${-86 * s} 0 z" fill="${fill}"/>
    <path d="M${x + 2 * s} ${y - 44 * s} q${30 * s} ${4 * s} ${33 * s} ${20 * s} l${5 * s} ${78 * s} q${-20 * s} ${6 * s} ${-38 * s} ${2 * s} z" fill="${PALETTE.deep}" opacity="0.22"/>
    <circle cx="${x - 11 * s}" cy="${y - 82 * s}" r="${8 * s}" fill="${PALETTE.paper}" opacity="0.35"/>
    <ellipse cx="${x}" cy="${y + 82 * s}" rx="${50 * s}" ry="${10 * s}" fill="${PALETTE.vignette}" opacity="0.6"/>
  </g>`;
}

// ---- 大问号 ----
export function questionBig(x, y, { enter = 'scale', size = 110 } = {}) {
  return `<g ${P(enter)}>${txt(x, y, '?', { size, weight: 800, fill: PALETTE.accent })}</g>`;
}

// ---- 标签卡（东西 / 钱）----
export function cardItem(x, y, label, { enter = 'left', variant = 'paper', w = 150, h = 96 } = {}) {
  const bg = variant === 'paper' ? PALETTE.paper : PALETTE.panelSoft;
  const fg = variant === 'paper' ? PALETTE.deep : PALETTE.ink;
  const stroke = variant === 'paper' ? PALETTE.steelDim : PALETTE.steel;
  const body = variant === 'paper'
    ? txt(x, y + 9, label, { size: 30, fill: fg, weight: 700 })
    : `<text x="${x}" y="${y - 2}" ${FONT} font-size="32" font-weight="700" fill="${PALETTE.accent}" text-anchor="middle">¥</text>${txt(x, y + 30, label, { size: 24, fill: fg, weight: 700 })}`;
  return `<g ${P(enter)}>
    <rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="14" fill="${bg}" stroke="${stroke}" stroke-width="2"/>
    ${body}
  </g>`;
}

// ---- 对向双箭头（买嫌贵 / 卖觉亏）----
export function swapArrows(x, y, { enter = 'scale' } = {}) {
  return `<g ${P(enter)}>
    <path d="M${x - 110} ${y - 18} h150 l-16 -14 m16 14 l-16 14" stroke="${PALETTE.cool}" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M${x + 110} ${y + 22} h-150 l16 -14 m-16 14 l16 14" stroke="${PALETTE.warn}" stroke-width="7" fill="none" stroke-linecap="round"/>
    ${txt(x - 110, y - 40, '买 · 嫌贵', { size: 20, fill: PALETTE.inkDim })}
    ${txt(x + 110, y + 56, '卖 · 觉亏', { size: 20, fill: PALETTE.inkDim })}
  </g>`;
}

// ---- 药丸标签 ----
export function pill(x, y, text, { enter = 'up', bg = PALETTE.accent, fg = PALETTE.deep, w = 0, size = 24 } = {}) {
  const ww = w || (text.length * size * 1.06 + 56);
  return `<g ${P(enter)}>
    <rect x="${x - ww / 2}" y="${y - 24}" width="${ww}" height="48" rx="24" fill="${bg}"/>
    ${txt(x, y + 9, text, { size, fill: fg, weight: 800 })}
  </g>`;
}

// ---- 马克杯（约 170 宽 × 170 高，含把手）----
// 风格化：右侧内阴影带 + 杯口高光弧（统一左上光源）
export function mug(x, y, { enter = 'scale', s = 1, opacity = 1, id = '' } = {}) {
  const w = 68 * s, h = 78 * s, hw = w, hh = h;
  return `<g ${P(enter)} opacity="${opacity}" ${id ? `id="${id}"` : ''}>
    <rect x="${x - hw}" y="${y - hh}" width="${2 * hw}" height="${2 * hh}" rx="${14 * s}" fill="${PALETTE.paper}"/>
    <rect x="${x + hw * 0.18}" y="${y - hh + 6 * s}" width="${hw * 0.62}" height="${2 * hh - 12 * s}" rx="${10 * s}" fill="${PALETTE.steelDim}" opacity="0.3"/>
    <path d="M${x - hw * 0.72} ${y - hh + 16 * s} q${hw * 0.5} ${-9 * s} ${hw * 1.05} 0" fill="none" stroke="${PALETTE.accentSoft}" stroke-width="${3.5 * s}" opacity="0.55" stroke-linecap="round"/>
    <rect x="${x - hw}" y="${y - hh}" width="${2 * hw}" height="${2 * hh}" rx="${14 * s}" fill="none" stroke="${PALETTE.steelDim}" stroke-width="3"/>
    <path d="M${x + hw} ${y - hh * 0.55} q${46 * s} ${4 * s} ${46 * s} ${hh * 0.55} q0 ${hh * 0.55 - 4 * s} ${-46 * s} ${hh * 0.55}" fill="none" stroke="${PALETTE.paper}" stroke-width="${17 * s}"/>
    <path d="M${x + hw} ${y - hh * 0.55} q${46 * s} ${4 * s} ${46 * s} ${hh * 0.55} q0 ${hh * 0.55 - 4 * s} ${-46 * s} ${hh * 0.55}" fill="none" stroke="${PALETTE.steelDim}" stroke-width="3"/>
    <ellipse cx="${x}" cy="${y - hh}" rx="${hw}" ry="${13 * s}" fill="${PALETTE.paper}" stroke="${PALETTE.steelDim}" stroke-width="3"/>
  </g>`;
}

// ---- 星光（金贵感，单星小 bbox，便于槽位摆放）----
export function sparkles(x, y, { enter = 'fade', r = 20 } = {}) {
  const k = r * 0.28;
  return `<g ${P(enter)}>
    <path d="M${x} ${y - r} L${x + k} ${y - k} L${x + r} ${y} L${x + k} ${y + k} L${x} ${y + r} L${x - k} ${y + k} L${x - r} ${y} L${x - k} ${y - k} Z" fill="${PALETTE.accentSoft}"/>
  </g>`;
}

// ---- 估价上调（价签 + 上箭头）----
export function upPrice(x, y, { enter = 'up' } = {}) {
  return `<g ${P(enter)}>
    <rect x="${x - 78}" y="${y - 20}" width="156" height="46" rx="10" fill="${PALETTE.paper}"/>
    ${txt(x, y + 9, '估价 ¥', { size: 24, fill: PALETTE.deep, weight: 800 })}
    <path d="M${x + 96} ${y + 18} l0 -44 m-13 14 l13 -16 l13 16" stroke="${PALETTE.accent}" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

// ---- 结论横幅（BANNER 槽专用）----
export function banner(x, y, text, { enter = 'up', bg = PALETTE.accent, fg = PALETTE.deep, size = 24 } = {}) {
  return pill(x, y, text, { enter, bg, fg, size });
}

// ---- 三组徽章 ----
export function groupChips(x, y, labels, { enter = 'up' } = {}) {
  const w = 150, gap = 26, x0 = x - (3 * w + 2 * gap) / 2;
  const chips = labels.map((t, i) => {
    const cx = x0 + i * (w + gap);
    return `<rect x="${cx}" y="${y - 26}" width="${w}" height="52" rx="12" fill="${PALETTE.panelSoft}" stroke="${PALETTE.steel}" stroke-width="2"/>
      ${txt(cx + w / 2, y + 9, t, { size: 24, fill: PALETTE.ink, weight: 700 })}`;
  }).join('');
  return `<g ${P(enter)}>${chips}</g>`;
}

// ---- 价格轴（卖家点高、买家点低）----
export function axisDots(x, y, { enter = 'scale' } = {}) {
  return `<g ${P(enter)}>
    <line x1="${x - 190}" y1="${y + 40}" x2="${x + 190}" y2="${y + 40}" stroke="${PALETTE.steelDim}" stroke-width="4"/>
    <circle cx="${x - 110}" cy="${y - 52}" r="12" fill="${PALETTE.warn}"/>
    ${txt(x - 110, y - 76, '卖家 · 高', { size: 20, fill: PALETTE.warn, weight: 700 })}
    <circle cx="${x + 110}" cy="${y + 6}" r="12" fill="${PALETTE.cool}"/>
    ${txt(x + 110, y - 18, '买家 · 低', { size: 20, fill: PALETTE.cool, weight: 700 })}
    <line x1="${x - 110}" y1="${y - 40}" x2="${x - 110}" y2="${y + 40}" stroke="${PALETTE.steelDim}" stroke-width="2" stroke-dasharray="4 5"/>
    <line x1="${x + 110}" y1="${y + 18}" x2="${x + 110}" y2="${y + 40}" stroke="${PALETTE.steelDim}" stroke-width="2" stroke-dasharray="4 5"/>
  </g>`;
}

// ---- 分叉选择 ----
export function choiceFork(x, y, { enter = 'scale' } = {}) {
  return `<g ${P(enter)}>
    <path d="M${x} ${y + 70} v-40 m0 0 q0 -50 ${-90} -62 m90 62 q0 -50 90 -62" stroke="${PALETTE.steel}" stroke-width="8" fill="none" stroke-linecap="round"/>
    ${txt(x - 118, y - 66, '杯子', { size: 24, fill: PALETTE.ink, weight: 700 })}
    ${txt(x + 118, y - 66, '一笔钱', { size: 24, fill: PALETTE.ink, weight: 700 })}
    ${txt(x, y + 106, '二选一', { size: 20, fill: PALETTE.inkDim })}
  </g>`;
}

// ---- 双面板（经济处境一样）----
export function twinPanels(x, y, a, b, { enter = 'up' } = {}) {
  const w = 220, gap = 40, x0 = x - (2 * w + gap) / 2;
  const one = (cx, t, fg) => `<rect x="${cx}" y="${y - 46}" width="${w}" height="92" rx="14" fill="${PALETTE.panel}" stroke="${PALETTE.steel}" stroke-width="2"/>
    ${txt(cx + w / 2, y + 9, t, { size: 26, fill: fg, weight: 700 })}`;
  return `<g ${P(enter)}>${one(x0, a, PALETTE.ink)}${one(x0 + w + gap, b, PALETTE.ink)}</g>`;
}

// ---- 天平（独占宽件，beam 可动画）----
export function scaleTilt(x, y, { enter = 'fade' } = {}) {
  return `<g ${P(enter)}>
    <rect x="${x - 16}" y="${y + 56}" width="32" height="70" rx="6" fill="${PALETTE.steel}"/>
    <path d="M${x - 80} ${y + 126} h160 l-14 18 h-132 z" fill="${PALETTE.steelDim}"/>
  </g>
  <g class="part" id="lossBeam" data-enter="fade">
    <rect x="${x - 210}" y="${y - 8}" width="420" height="16" rx="8" fill="${PALETTE.steel}"/>
    <line x1="${x - 170}" y1="${y + 6}" x2="${x - 170}" y2="${y + 50}" stroke="${PALETTE.steelDim}" stroke-width="3"/>
    <path d="M${x - 212} ${y + 50} q42 42 84 0 z" fill="${PALETTE.cool}" opacity="0.9"/>
    ${txt(x - 170, y + 38, '得到·快乐', { size: 18, fill: PALETTE.ink })}
    <line x1="${x + 170}" y1="${y + 6}" x2="${x + 170}" y2="${y + 54}" stroke="${PALETTE.steelDim}" stroke-width="3"/>
    <path d="M${x + 126} ${y + 54} q44 44 88 0 z" fill="${PALETTE.warn}" opacity="0.92"/>
    ${txt(x + 170, y + 42, '失去·痛苦', { size: 18, fill: PALETTE.ink })}
  </g>`;
}

// ---- 3块 / 7块 对比 ----
export function gainLossPair(x, y, { enter = 'up' } = {}) {
  const w = 200, gap = 60, x0 = x - (2 * w + gap) / 2;
  return `<g ${P(enter)}>
    <rect x="${x0}" y="${y - 50}" width="${w}" height="100" rx="14" fill="${PALETTE.panel}" stroke="${PALETTE.cool}" stroke-width="3"/>
    ${txt(x0 + w / 2, y - 8, '要得到', { size: 22, fill: PALETTE.inkDim })}
    ${txt(x0 + w / 2, y + 32, '¥ 3', { size: 34, fill: PALETTE.cool, weight: 800 })}
    <rect x="${x0 + w + gap}" y="${y - 50}" width="${w}" height="100" rx="14" fill="${PALETTE.panel}" stroke="${PALETTE.warn}" stroke-width="3"/>
    ${txt(x0 + w + gap + w / 2, y - 8, '要失去', { size: 22, fill: PALETTE.inkDim })}
    ${txt(x0 + w + gap + w / 2, y + 32, '¥ 7', { size: 34, fill: PALETTE.warn, weight: 800 })}
  </g>`;
}

// ---- 定理面板 ----
export function theoryPanel(x, y, title, line2, { enter = 'up' } = {}) {
  const w = 460, h = 120;
  return `<g ${P(enter)}>
    <rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="16" fill="${PALETTE.panel}" stroke="${PALETTE.steel}" stroke-width="2"/>
    ${txt(x, y - 16, title, { size: 28, fill: PALETTE.accent, weight: 800 })}
    ${txt(x, y + 26, line2, { size: 22, fill: PALETTE.ink })}
  </g>`;
}

// ---- 循环撮合（双弧箭头）----
export function gearLoop(x, y, { enter = 'scale' } = {}) {
  return `<g ${P(enter)}>
    <path d="M${x - 110} ${y + 30} a110 70 0 1 1 60 62" fill="none" stroke="${PALETTE.steel}" stroke-width="9" stroke-linecap="round"/>
    <path d="M${x - 66} ${y + 96} l30 -18 l-4 36" fill="none" stroke="${PALETTE.steel}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${x}" cy="${y}" r="34" fill="${PALETTE.panelSoft}" stroke="${PALETTE.steel}" stroke-width="3"/>
    ${txt(x, y + 10, '交易', { size: 24, fill: PALETTE.ink, weight: 700 })}
  </g>`;
}

// ---- 砖墙 ----
export function wallDiv(x, y, { enter = 'scale', h = 220 } = {}) {
  let rows = '';
  for (let i = 0; i < 5; i++) {
    const ry = y - h / 2 + i * (h / 5);
    rows += `<line x1="${x - 24}" y1="${ry + h / 10}" x2="${x + 24}" y2="${ry + h / 10}" stroke="${PALETTE.deep}" stroke-width="3" opacity="0.4"/>`;
  }
  return `<g ${P(enter)}>
    <rect x="${x - 30}" y="${y - h / 2}" width="60" height="${h}" rx="6" fill="${PALETTE.steelDim}" opacity="0.85"/>
    ${rows}
  </g>`;
}

// ---- 巧克力（左上高光角 + 格纹）----
export function choco(x, y, { enter = 'right', s = 1 } = {}) {
  const w = 62 * s, h = 72 * s;
  return `<g ${P(enter)}>
    <rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="10" fill="${PALETTE.accentDeep}" stroke="${PALETTE.accentSoft}" stroke-width="3"/>
    <rect x="${x - w / 2 + 5}" y="${y - h / 2 + 5}" width="${w * 0.32}" height="${h * 0.26}" rx="6" fill="${PALETTE.accent}" opacity="0.45"/>
    <line x1="${x - w / 2}" y1="${y - h / 6}" x2="${x + w / 2}" y2="${y - h / 6}" stroke="${PALETTE.deep}" stroke-width="2" opacity="0.5"/>
    <line x1="${x - w / 2}" y1="${y + h / 6}" x2="${x + w / 2}" y2="${y + h / 6}" stroke="${PALETTE.deep}" stroke-width="2" opacity="0.5"/>
    <line x1="${x - w / 6}" y1="${y - h / 2}" x2="${x - w / 6}" y2="${y + h / 2}" stroke="${PALETTE.deep}" stroke-width="2" opacity="0.5"/>
    <line x1="${x + w / 6}" y1="${y - h / 2}" x2="${x + w / 6}" y2="${y + h / 2}" stroke="${PALETTE.deep}" stroke-width="2" opacity="0.5"/>
  </g>`;
}

// ---- 五五开分半条 ----
export function halfSplit(x, y, { enter = 'up' } = {}) {
  const w = 420, h = 56;
  return `<g ${P(enter)}>
    <rect x="${x - w / 2}" y="${y - h / 2}" width="${w / 2}" height="${h}" rx="12" fill="${PALETTE.cool}" opacity="0.85"/>
    <rect x="${x}" y="${y - h / 2}" width="${w / 2}" height="${h}" rx="12" fill="${PALETTE.warn}" opacity="0.85"/>
    ${txt(x - w / 4, y + 9, '换 ≈50%', { size: 22, fill: PALETTE.deep, weight: 800 })}
    ${txt(x + w / 4, y + 9, '不换 ≈50%', { size: 22, fill: PALETTE.deep, weight: 800 })}
  </g>`;
}

// ---- 守着不放（两把锁箱）----
export function lockBoxes(x, y, { enter = 'up' } = {}) {
  const box = (bx, label) => `<rect x="${bx - 80}" y="${y - 46}" width="160" height="92" rx="12" fill="${PALETTE.panel}" stroke="${PALETTE.steelDim}" stroke-width="3"/>
    <rect x="${bx - 26}" y="${y - 20}" width="52" height="40" rx="8" fill="none" stroke="${PALETTE.accent}" stroke-width="6"/>
    <path d="M${bx - 16} ${y - 20} v-10 a16 16 0 0 1 32 0 v10" fill="none" stroke="${PALETTE.accent}" stroke-width="6"/>
    ${txt(bx, y + 74, label, { size: 20, fill: PALETTE.inkDim })}`;
  return `<g ${P(enter)}>${box(x - 140, '杯子在手')}${box(x + 140, '巧克力在手')}</g>`;
}

// ---- 失效封印（圆 + 斜杠）----
export function brokenSeal(x, y, { enter = 'scale' } = {}) {
  return `<g ${P(enter)}>
    <circle cx="${x}" cy="${y}" r="74" fill="none" stroke="${PALETTE.warn}" stroke-width="10"/>
    <line x1="${x - 52}" y1="${y + 52}" x2="${x + 52}" y2="${y - 52}" stroke="${PALETTE.warn}" stroke-width="10" stroke-linecap="round"/>
    ${txt(x, y - 96, '失效', { size: 26, fill: PALETTE.warn, weight: 800 })}
  </g>`;
}

// ---- 退货循环箭头（可旋转动画）----
export function returnLoop(x, y, { enter = 'scale' } = {}) {
  return `<g ${P('scale')} id="refundLoop">
    <path d="M${x + 8} ${y - 78} a78 78 0 1 1 -30 20" fill="none" stroke="${PALETTE.accent}" stroke-width="10" stroke-linecap="round"/>
    <path d="M${x - 30} ${y - 62} l9 -34 l34 9" fill="none" stroke="${PALETTE.accent}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

// ---- 购物车 ----
export function cart(x, y, { enter = 'left' } = {}) {
  return `<g ${P(enter)}>
    <path d="M${x - 120} ${y - 40} h26 l24 106 h150 l20 -74 h-196" fill="none" stroke="${PALETTE.steel}" stroke-width="8" stroke-linejoin="round"/>
    <circle cx="${x - 52}" cy="${y + 88}" r="11" fill="${PALETTE.steel}"/>
    <circle cx="${x + 66}" cy="${y + 88}" r="11" fill="${PALETTE.steel}"/>
  </g>`;
}

// ---- 手机出价（屏幕下方暗面渐隐带）----
export function phoneBid(x, y, { enter = 'right', label = '出价' } = {}) {
  return `<g ${P(enter)}>
    <rect x="${x - 58}" y="${y - 98}" width="116" height="196" rx="18" fill="${PALETTE.panel}"/>
    <rect x="${x - 44}" y="${y - 78}" width="88" height="150" rx="8" fill="${PALETTE.deep}"/>
    <rect x="${x - 44}" y="${y + 22}" width="88" height="50" rx="8" fill="${PALETTE.steelDim}" opacity="0.35"/>
    <circle cx="${x}" cy="${y + 86}" r="12" fill="${PALETTE.accent}"/>
    <rect x="${x + 44}" y="${y - 96}" width="88" height="40" rx="12" fill="${PALETTE.paper}"/>
    ${txt(x + 88, y - 70, label, { size: 18, fill: PALETTE.deep, weight: 700 })}
  </g>`;
}

// ---- 对比柱 ----
export function barsPair(x, y, a, b, la, lb, { enter = 'up', va = '2×', vb = '更高' } = {}) {
  const w = 110, gap = 90, x0 = x - (2 * w + gap) / 2;
  const base = y + 70;
  const col = (bx, h, fill, label, val) => `<rect x="${bx}" y="${base - h}" width="${w}" height="${h}" rx="10" fill="${fill}"/>
    ${txt(bx + w / 2, base - h - 12, val, { size: 24, fill, weight: 800 })}
    ${txt(bx + w / 2, base + 30, label, { size: 20, fill: PALETTE.inkDim })}`;
  return `<g ${P(enter)}>${col(x0, a, PALETTE.steel, la, va)}${col(x0 + w + gap, b, PALETTE.accent, lb, vb)}</g>`;
}

// ---- 球票对 ----
export function ticketPair(x, y, { enter = 'up' } = {}) {
  const t = (bx, val, fill, label) => `<g transform="rotate(-6 ${bx} ${y})">
      <rect x="${bx - 95}" y="${y - 58}" width="190" height="116" rx="12" fill="${fill}" stroke="${PALETTE.deep}" stroke-width="2" stroke-dasharray="8 6"/>
    </g>
    ${txt(bx, y - 12, val, { size: 32, fill: PALETTE.deep, weight: 800 })}
    ${txt(bx, y + 24, label, { size: 19, fill: PALETTE.deep, opacity: 0.85 })}`;
  return `<g ${P(enter)}>${t(x - 150, '$100+', PALETTE.panelSoft)}${t(x + 150, '$2000+', PALETTE.accent)}</g>`;
}

// ---- 商贩 ----
export function traderFig(x, y, { enter = 'up' } = {}) {
  return `<g ${P(enter)}>
    ${person(x, y, { enter: null, fill: PALETTE.steelDim })}
    <rect x="${x - 92}" y="${y - 118}" width="184" height="44" rx="10" fill="${PALETTE.panelSoft}"/>
    ${txt(x, y - 90, '老手 · 价差小', { size: 22, fill: PALETTE.ink, weight: 700 })}
  </g>`;
}

// ---- 下跌走势图（线可描画动画）----
export function chartDown(x, y, { enter = 'up' } = {}) {
  const w = 480, h = 240, x0 = x - w / 2, y0 = y - h / 2;
  return `<g ${P(enter)}>
    <rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="12" fill="${PALETTE.panel}" opacity="0.5"/>
    <line x1="${x0 + 26}" y1="${y0 + h - 24}" x2="${x0 + w - 20}" y2="${y0 + h - 24}" stroke="${PALETTE.steelDim}" stroke-width="2"/>
    <line x1="${x0 + 26}" y1="${y0 + 20}" x2="${x0 + 26}" y2="${y0 + h - 24}" stroke="${PALETTE.steelDim}" stroke-width="2"/>
    <path id="refLine" d="M${x0 + 36} ${y0 + 52} L${x0 + 130} ${y0 + 74} L${x0 + 210} ${y0 + 46} L${x0 + 290} ${y0 + 128} L${x0 + 370} ${y0 + 172} L${x0 + 440} ${y0 + 208}" fill="none" stroke="${PALETTE.warn}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
    <circle id="refEnd" cx="${x0 + 440}" cy="${y0 + 208}" r="9" fill="${PALETTE.warn}" opacity="0"/>
  </g>`;
}

// ---- 旧物纸箱 ----
export function oldBox(x, y, { enter = 'left' } = {}) {
  return `<g ${P(enter)}>
    <path d="M${x - 90} ${y + 44} l36 -30 h108 l36 30 v-40 h-180 z" fill="${PALETTE.panelSoft}"/>
    <rect x="${x - 90}" y="${y + 4}" width="180" height="40" fill="${PALETTE.panel}"/>
    ${txt(x, y + 32, '旧物 · 关系', { size: 19, fill: PALETTE.inkDim })}
  </g>`;
}

// ---- 放大镜 ----
export function mirrorGlass(x, y, { enter = 'scale' } = {}) {
  return `<g ${P(enter)}>
    <circle cx="${x}" cy="${y}" r="96" fill="none" stroke="${PALETTE.steel}" stroke-width="11"/>
    <circle cx="${x}" cy="${y}" r="96" fill="${PALETTE.cool}" opacity="0.06"/>
    <line x1="${x + 68}" y1="${y + 68}" x2="${x + 132}" y2="${y + 132}" stroke="${PALETTE.steel}" stroke-width="13" stroke-linecap="round"/>
  </g>`;
}

// ---- 对勾徽章（内圈暗面 + 高光点）----
export function checkBadge(x, y, { enter = 'scale' } = {}) {
  return `<g ${P(enter)}>
    <circle cx="${x}" cy="${y}" r="38" fill="${PALETTE.accent}"/>
    <path d="M${x + 6} ${y + 37} a38 38 0 0 0 32 -30 a38 38 0 0 1 -32 30 z" fill="${PALETTE.accentDeep}" opacity="0.5"/>
    <circle cx="${x - 14}" cy="${y - 15}" r="7" fill="${PALETTE.paper}" opacity="0.5"/>
    <path d="M${x - 18} ${y} l14 16 l26 -32" fill="none" stroke="${PALETTE.deep}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

// ---- 问句气泡 ----
export function bubble(x, y, lines, { enter = 'left', w = 330 } = {}) {
  const h = 34 + lines.length * 34;
  return `<g ${P(enter)}>
    <rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="16" fill="${PALETTE.paper}"/>
    <path d="M${x + w / 2 - 40} ${y + h / 2} l14 26 l22 -26 z" fill="${PALETTE.paper}"/>
    ${lines.map((t, i) => txt(x, y - h / 2 + 36 + i * 34, t, { size: 22, fill: i === lines.length - 1 ? PALETTE.warn : PALETTE.deep, weight: 700 })).join('')}
  </g>`;
}

// ---- 经验进度条 ----
export function progressExp(x, y, { enter = 'up' } = {}) {
  return `<g ${P(enter)}>
    ${txt(x, y - 34, '经验', { size: 24, fill: PALETTE.inkDim })}
    <rect x="${x - 100}" y="${y - 12}" width="200" height="20" rx="10" fill="${PALETTE.panel}"/>
    <rect id="expFill" x="${x - 100}" y="${y - 12}" width="24" height="20" rx="10" fill="${PALETTE.accent}"/>
    ${txt(x, y + 44, '生疏 → 熟练', { size: 21, fill: PALETTE.ink, weight: 700 })}
  </g>`;
}

// ============ v2.2 新增：多样"结论句式"组件（替代满屏 banner）+ 编排专用件 ============

// ---- 大字陈述句（居中强调排版，非横幅）----
export function statement(x, y, text, { enter = 'up', size = 40, fill = PALETTE.ink, accentWord = '' } = {}) {
  let body = text;
  if (accentWord && text.includes(accentWord)) {
    const [pre, post] = text.split(accentWord);
    body = `${pre}<tspan fill="${PALETTE.accent}">${accentWord}</tspan>${post}`;
  }
  return `<g ${P(enter)}>
    ${txt(x, y, body, { size, fill, weight: 800 })}
    <rect x="${x - 130}" y="${y + 22}" width="260" height="5" rx="2.5" fill="${PALETTE.accent}" opacity="0.9"/>
  </g>`;
}

// ---- 斜贴便签 ----
export function noteCard(x, y, text, { enter = 'left', rot = -5, w = 300 } = {}) {
  const h = 92;
  return `<g ${P(enter)}>
    <g transform="rotate(${rot} ${x} ${y})">
      <rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="8" fill="${PALETTE.paper}"/>
      <rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="26" rx="8" fill="${PALETTE.accentSoft}" opacity="0.55"/>
      ${txt(x, y + 16, text, { size: 28, fill: PALETTE.deep, weight: 800 })}
    </g>
  </g>`;
}

// ---- 圆形图章 ----
export function stamp(x, y, text, { enter = 'scale', r = 74, fill = PALETTE.warn } = {}) {
  return `<g ${P(enter)}>
    <circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${fill}" stroke-width="8"/>
    <circle cx="${x}" cy="${y}" r="${r - 14}" fill="none" stroke="${fill}" stroke-width="2.5" opacity="0.7"/>
    ${txt(x, y + 10, text, { size: 30, fill, weight: 800 })}
  </g>`;
}

// ---- 思考的人（人 + 思考泡）----
export function personThink(x, y, lines, { enter = 'up', w = 280 } = {}) {
  const bx = x + 150, by = y - 190;
  const h = 34 + lines.length * 34;
  return `<g ${P(enter)}>
    ${person(x, y, { enter: null, fill: PALETTE.steelDim })}
    <circle cx="${x + 58}" cy="${y - 128}" r="9" fill="${PALETTE.panelSoft}"/>
    <circle cx="${x + 92}" cy="${y - 156}" r="14" fill="${PALETTE.panelSoft}"/>
    <rect x="${bx - w / 2}" y="${by - h / 2}" width="${w}" height="${h}" rx="18" fill="${PALETTE.panelSoft}"/>
    ${lines.map((t, i) => txt(bx, by - h / 2 + 38 + i * 34, t, { size: 26, fill: PALETTE.ink, weight: 700 })).join('')}
  </g>`;
}

// ---- 沙漏（时间流逝）----
export function hourglass(x, y, { enter = 'fade', h = 170 } = {}) {
  const w = h * 0.62, top = y - h / 2;
  return `<g ${P(enter)}>
    <path d="M${x - w / 2} ${top} L${x + w / 2} ${top} L${x + 12} ${y} L${x + w / 2} ${top + h} L${x - w / 2} ${top + h} L${x - 12} ${y} Z"
          fill="${PALETTE.panel}" stroke="${PALETTE.steel}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M${x - 20} ${top + 14} L${x + 20} ${top + 14} L${x + 4} ${y - 6} L${x - 4} ${y - 6} Z" fill="${PALETTE.accentSoft}"/>
    <path d="M${x - 16} ${top + h - 12} L${x + 16} ${top + h - 12} L${x + 3} ${y + 30} L${x - 3} ${y + 30} Z" fill="${PALETTE.accent}"/>
  </g>`;
}

// ---- 校园（哥特柱廊，康奈尔）----
export function campus(x, y, { enter = 'up', w = 300 } = {}) {
  const cols = 5, cw = 34, gap = (w - cols * cw) / (cols + 1), top = y - 105;
  let c = '';
  for (let i = 0; i < cols; i++) {
    const cx = x - w / 2 + gap + i * (cw + gap);
    c += `<rect x="${cx}" y="${top + 30}" width="${cw}" height="95" fill="${PALETTE.panel}"/>
          <rect x="${cx - 5}" y="${top + 24}" width="${cw + 10}" height="10" rx="3" fill="${PALETTE.steelDim}"/>`;
  }
  return `<g ${P(enter)}>
    <path d="M${x - w / 2 - 10} ${top + 30} L${x} ${top - 26} L${x + w / 2 + 10} ${top + 30} Z" fill="${PALETTE.accent}" opacity="0.85"/>
    ${c}
    <rect x="${x - w / 2 - 16}" y="${top + 125}" width="${w + 32}" height="12" rx="4" fill="${PALETTE.steelDim}"/>
    <circle cx="${x}" cy="${top + 2}" r="6" fill="${PALETTE.deep}"/>
  </g>`;
}

// ---- 金币（暗面月牙 + 左上高光弧）----
export function coin(x, y, { enter = 'scale', r = 26, s = 1 } = {}) {
  return `<g ${P(enter)}>
    <circle cx="${x}" cy="${y}" r="${r * s}" fill="${PALETTE.accent}"/>
    <path d="M${x + r * s * 0.1} ${y + r * s * 0.98} a${r * s} ${r * s} 0 0 0 ${r * s * 0.88} -${r * s * 0.5} a${r * s * 1.15} ${r * s * 1.15} 0 0 1 -${r * s * 0.88} ${r * s * 0.5} z" fill="${PALETTE.accentDeep}" opacity="0.55"/>
    <circle cx="${x}" cy="${y}" r="${r * s - 7 * s}" fill="none" stroke="${PALETTE.deep}" stroke-width="2.5" opacity="0.75"/>
    <path d="M${x - r * s * 0.55} ${y - r * s * 0.62} a${r * s * 0.85} ${r * s * 0.85} 0 0 1 ${r * s * 0.62} -${r * s * 0.5}" fill="none" stroke="${PALETTE.accentSoft}" stroke-width="${3.2 * s}" opacity="0.8" stroke-linecap="round"/>
    ${txt(x, y + 9 * s, '¥', { size: 26 * s, fill: PALETTE.deep, weight: 800 })}
  </g>`;
}

// ---- 心（依恋，左上高光点）----
export function heart(x, y, { enter = 'scale', s = 1, fill = PALETTE.warn } = {}) {
  const k = 30 * s;
  return `<g ${P(enter)}>
    <path d="M${x} ${y + k} C${x - k * 1.7} ${y - k * 0.2} ${x - k * 0.7} ${y - k * 1.4} ${x} ${y - k * 0.45} C${x + k * 0.7} ${y - k * 1.4} ${x + k * 1.7} ${y - k * 0.2} ${x} ${y + k} Z" fill="${fill}"/>
    <circle cx="${x - k * 0.55}" cy="${y - k * 0.35}" r="${k * 0.16}" fill="${PALETTE.paper}" opacity="0.55"/>
  </g>`;
}
