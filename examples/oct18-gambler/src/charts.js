// charts.js — 规范化数据图表库
// 方法论沉淀见 docs/chart-method.md（来源：OpenMontage data-visualization 决策树 +
// Disney 十二原则×数据可视化 + Remotion 图表动画范式）。
// 核心纪律：
//  - 选型：比较→柱状 / 趋势→折线 / 比例(part-to-whole)→环形(≤6片) / 单一数字→大数字卡 / <3 数据点→别用图表
//  - 动画：框架先于数据；柱自零基线左→右错峰生长+过冲回稳；折线左→右描线；
//    环形自 12 点钟顺时针扫掠、最大片先；数值标签在数据元素之后落定
//  - 全程 seek 安全：纯 attr 补间，禁止 onUpdate/onStart 回调（导出时 seek 抑制回调）
import { PALETTE } from './palette.js';

const FONT = 'font-family="Microsoft YaHei, Noto Sans SC, PingFang SC, sans-serif"';

// ---- 柱状系列（比较 / 进步趋势）：框架线先在，柱错峰生长，标签随后落定 ----
export function barSeries(x, y, values, labels, { bw = 72, gap = 50, maxH = 200, maxV = null, fmt = (v) => v, highlight = -1 } = {}) {
  const mv = maxV || Math.max(...values);
  const n = values.length;
  const total = n * bw + (n - 1) * gap;
  const x0 = x - total / 2;
  const base = y + maxH / 2;
  const cols = values.map((v, i) => {
    const h = Math.max(8, Math.round((v / mv) * maxH));
    const bx = x0 + i * (bw + gap);
    const fill = i === highlight ? PALETTE.accent : PALETTE.steel;
    return `<g class="cbar" data-i="${i}">
      <rect class="cbarRect" x="${bx}" y="${base - h}" width="${bw}" height="${h}" rx="10" fill="${fill}"/>
      <text class="cbarVal" x="${bx + bw / 2}" y="${base - h - 14}" ${FONT} font-size="26" font-weight="800" fill="${fill}" text-anchor="middle" opacity="0">${fmt(v)}</text>
      <text class="cbarLab" x="${bx + bw / 2}" y="${base + 36}" ${FONT} font-size="20" fill="${PALETTE.inkDim}" text-anchor="middle" opacity="0">${labels[i]}</text>
    </g>`;
  }).join('');
  return `<g class="part" data-enter="up">
    <line x1="${x0 - 34}" y1="${base}" x2="${x0 + total + 34}" y2="${base}" stroke="${PALETTE.steelDim}" stroke-width="2.5"/>
    ${cols}
  </g>`;
}

// ---- 环形图（比例 part-to-whole）：自 12 点钟顺时针扫掠，centerLabel 落中心 ----
// segments: [[fraction, color], ...]（fraction 合计 = 1）
export function donut(x, y, r, segments, { strokeW = 42, centerLabel = '', sideLabels = null } = {}) {
  const C = 2 * Math.PI * r;
  let acc = 0;
  const rings = segments.map(([f, color], i) => {
    const len = f * C;
    const startDeg = -90 + (acc / C) * 360; // 12 点钟起
    acc += len;
    return `<circle class="cdseg" data-i="${i}" data-final="${len} ${C - len}" cx="${x}" cy="${y}" r="${r}" fill="none"
      stroke="${color}" stroke-width="${strokeW}" stroke-linecap="butt"
      stroke-dasharray="0 ${C}" stroke-dashoffset="0"
      transform="rotate(${startDeg} ${x} ${y})"/>`;
  }).join('');
  const sides = sideLabels
    ? sideLabels.map(([tx, ty, text, color], i) =>
        `<text class="cdlab" data-i="${i}" x="${tx}" y="${ty}" ${FONT} font-size="24" font-weight="700" fill="${color}" text-anchor="middle" opacity="0">${text}</text>`).join('')
    : '';
  const center = centerLabel
    ? `<text class="cdcenter" x="${x}" y="${y + 12}" ${FONT} font-size="34" font-weight="800" fill="${PALETTE.ink}" text-anchor="middle" opacity="0">${centerLabel}</text>`
    : '';
  return `<g class="part" data-enter="scale">
    <circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${PALETTE.panelSoft}" stroke-width="${strokeW}" opacity="0.35"/>
    ${rings}${center}${sides}
  </g>`;
}

// ================= 编排（由 illustrations.js 的 CHOREO 调用） =================

// 柱状生长：零基线错峰 + back.out 过冲回稳；数值/类别标签在各自柱身后落定
export function growBars(tl, g, t0, { stagger = 0.16, dur = 0.85 } = {}) {
  const bars = g.querySelectorAll('.cbar');
  bars.forEach((bar, i) => {
    const rect = bar.querySelector('.cbarRect');
    const val = bar.querySelector('.cbarVal');
    const lab = bar.querySelector('.cbarLab');
    if (rect) {
      const h = +rect.getAttribute('height');
      const y = +rect.getAttribute('y');
      tl.fromTo(rect,
        { attr: { height: 4, y: y + h - 4 } },
        { attr: { height: h, y }, duration: dur, ease: 'back.out(1.4)' },
        t0 + i * stagger);
    }
    const at = t0 + i * stagger + dur * 0.55;
    if (val) tl.to(val, { opacity: 1, duration: 0.3 }, at);
    if (lab) tl.to(lab, { opacity: 1, duration: 0.3 }, at + 0.1);
  });
}

// 环形扫掠：各片自 12 点钟起顺时针依次展开（大片先），中心与侧标签随后
export function sweepDonut(tl, g, t0, { each = 0.9 } = {}) {
  const segs = g.querySelectorAll('.cdseg');
  segs.forEach((seg, i) => {
    const final = seg.getAttribute('data-final');
    tl.fromTo(seg, { attr: { 'stroke-dasharray': `0 ${final.split(' ')[1]}` } },
      { attr: { 'stroke-dasharray': final }, duration: each, ease: 'power2.inOut' },
      t0 + i * each);
  });
  const n = segs.length;
  const center = g.querySelector('.cdcenter');
  if (center) tl.to(center, { opacity: 1, duration: 0.4 }, t0 + n * each + 0.1);
  g.querySelectorAll('.cdlab').forEach((lab, i) => {
    tl.to(lab, { opacity: 1, duration: 0.35 }, t0 + n * each + 0.25 + i * 0.15);
  });
}

// 折线描线：左→右（pathLength=1 + dashoffset 1→0），endDot 可选终点脉冲
export function drawLine(tl, path, t0, { dur = 2.2, endDot = null } = {}) {
  if (!path) return;
  tl.fromTo(path, { attr: { 'stroke-dashoffset': 1 } },
    { attr: { 'stroke-dashoffset': 0 }, duration: dur, ease: 'power1.inOut' }, t0);
  if (endDot) tl.to(endDot, { opacity: 1, duration: 0.3, ease: 'power1.out' }, t0 + dur);
}
