// typography.js — 文字编排层（v2.6 新增）：文字从"底部字幕"升级为舞台元素
// 法则来源：20261017_text_choreography/final/文字编排法则.md（四类 16 式，联网查证）
// 实现约定：全部"时间的函数"求值（seg/ease + t），不用 tween —— 逐帧 seek 绝对可复现
// 硬约束：一次只动 1-2 个元素；入场 easeOutExpo；行错峰 0.24-0.3s；词义驱动动效
import { PALETTE } from './palette.js';
import { CUES } from './storyboard.js';

const NS = 'http://www.w3.org/2000/svg';
const FONT = 'Microsoft YaHei, Noto Sans SC, PingFang SC, sans-serif';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const eio = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2); // easeInOutCubic
const eoExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));                 // 行业标准入场
const easeInQuad = (x) => x * x;                                               // 慢显（戏剧/偷偷）

// 舞台文字节点（x/y 恒为 0，位置全走 transform —— 缩放天然绕文字中心）
function mkText(parent, { size, weight, fill, ls = 2 }) {
  const el = document.createElementNS(NS, 'text');
  el.setAttribute('x', '0');
  el.setAttribute('y', '0');
  el.setAttribute('font-family', FONT);
  el.setAttribute('font-size', String(size));
  el.setAttribute('font-weight', String(weight));
  el.setAttribute('fill', fill);
  if (ls) el.setAttribute('letter-spacing', String(ls));
  el.setAttribute('text-anchor', 'middle');
  parent.appendChild(el);
  return el;
}

// ---------------- s05 · 上下站位让位（用户 2026-10-17 原例接入真实字幕） ----------------
// cue8 是“拥有”这个动作      9.266–10.833 → 打字机入场（0.13s/字）→ 让位退后（上移+缩小+淡化）
// cue9 给他心里的估价偷偷加了价 10.833–13.266 → 两行接管：
//   「给他心里的估价」easeOutExpo pop；「偷偷加了价」词义驱动（偷偷=缓入慢显 55%→100%）
// 站位：上部自由带 y 100–300（s05 无标题卡；mug 顶 ≈324，已避让；字幕带/底框本幕由编排接管）
function buildS05(layer) {
  const c8 = CUES[7], c9 = CUES[8];
  const TYPE_T0 = c8.start + 0.2, STEP = 0.13;
  const REC0 = c8.end + 0.07, REC1 = REC0 + 0.65;   // 让位窗口（新句已在身后起手，短暂上下站位）
  const L1_T0 = c9.start + 0.17, L1_DUR = 0.55;     // 第一行接管（easeOutExpo）
  const L2_T0 = L1_T0 + 0.3, L2_DUR = 0.9;          // 第二行慢显（行错峰 0.3s）
  const EXIT0 = c9.end - 0.32, EXIT1 = c9.end;      // 幕尾随场景一起交给转场

  const g = document.createElementNS(NS, 'g');
  g.style.opacity = '0';
  layer.appendChild(g);

  // 旧句（Anchor）：打字机逐字 + 光标；“拥有”琥珀强调
  const l1 = mkText(g, { size: 40, weight: 600, fill: PALETTE.ink });
  const text = '是“拥有”这个动作';
  const spans = [];
  for (const ch of text) {
    const ts = document.createElementNS(NS, 'tspan');
    ts.textContent = ch;
    if (ch === '“' || ch === '”') ts.setAttribute('fill', PALETTE.accent);
    ts.setAttribute('opacity', '0');
    l1.appendChild(ts);
    spans.push(ts);
  }
  const cursor = document.createElementNS(NS, 'rect');
  cursor.setAttribute('width', '3.5');
  cursor.setAttribute('height', '34');
  cursor.setAttribute('fill', PALETTE.ink);
  cursor.setAttribute('opacity', '0');
  g.appendChild(cursor);

  // 新句（Active）：两行 lockup
  const l2 = mkText(g, { size: 46, weight: 700, fill: PALETTE.ink });
  l2.textContent = '给他心里的估价';
  const l3 = mkText(g, { size: 66, weight: 800, fill: PALETTE.accent, ls: 6 });
  l3.textContent = '偷偷加了价';

  const X = 640;
  return {
    covers(t) { return t >= c8.start && t < c9.end; },
    update(t) {
      const on = t >= c8.start && t < c9.end;
      g.style.opacity = on ? String(1 - seg(t, EXIT0, EXIT1)) : '0';
      if (!on) return;

      // A① 打字机（步进揭示，0.13s/字 × 10 字 ≈ 1.3s，cue8 内收口）
      const shown = clamp(Math.floor((t - TYPE_T0) / STEP) + 1, 0, spans.length);
      spans.forEach((sp, i) => sp.setAttribute('opacity', i < shown ? '1' : '0'));

      // A② 让位：上移 54px、缩到 0.62、淡化到 0.45（quiet recedes：小而淡 = 远）
      const k = eio(seg(t, REC0, REC1));
      const y1 = 182 - 54 * k, s1 = 1 - 0.38 * k, o1 = 1 - 0.55 * k;
      l1.setAttribute('opacity', String(o1));
      l1.setAttribute('transform', `translate(${X} ${y1.toFixed(1)}) scale(${s1.toFixed(3)})`);

      // 光标：跟在最后一个已出字右侧，让位开始即熄灭
      if (t < REC0 && shown > 0 && Math.floor(t * 3) % 2 === 0) {
        let w = 0;
        for (let i = 0; i < shown; i++) {
          try { w += spans[i].getComputedTextLength(); } catch { w += 40; }
        }
        let half = text.length * 40;
        try { half = l1.getComputedTextLength() / 2; } catch { /* 兜底近似 */ }
        cursor.setAttribute('x', String(X - half + w + 5));
        cursor.setAttribute('y', String(y1 - 26));
        cursor.setAttribute('opacity', '1');
      } else {
        cursor.setAttribute('opacity', '0');
      }

      // A③ 新句第一行：easeOutExpo pop + 上浮归位（大 = 近，接管焦点）
      const p2 = eoExpo(seg(t, L1_T0, L1_T0 + L1_DUR));
      l2.setAttribute('opacity', String(p2));
      l2.setAttribute('transform', `translate(${X} ${(196 + (1 - p2) * 24).toFixed(1)})`);

      // A④ 新句第二行："偷偷" = 词义驱动，缓入慢显 + 55%→100% 戏剧 scale
      const p3 = easeInQuad(seg(t, L2_T0, L2_T0 + L2_DUR));
      l3.setAttribute('opacity', String(p3));
      l3.setAttribute('transform', `translate(${X} ${(272 + (1 - p3) * 14).toFixed(1)}) scale(${(0.55 + 0.45 * p3).toFixed(3)})`);
    },
  };
}

export const TYPO_SCENES = ['s05'];

export function buildTypoLayer() {
  const layer = document.getElementById('typoLayer');
  const s05 = buildS05(layer);
  return {
    covers(t) { return s05.covers(t); },
    update(t) { s05.update(t); },
  };
}
