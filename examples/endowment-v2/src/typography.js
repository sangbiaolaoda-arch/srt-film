// typography.js — 文字编排层（v2.6 → v2.7 全片铺开）：文字从"底部字幕"升级为舞台元素
// 法则来源：20261017_text_choreography/final/文字编排法则.md（七类 37 式，联网查证）
// 实现约定：全部"时间的函数"求值（seg/ease + t），不用 tween —— 逐帧 seek 绝对可复现
// 硬约束：一次只动 1-2 个元素；入场 easeOutExpo；行错峰 ≥0.24s；词义驱动动效；
//         站位只占上部自由带 y 90–330（主体带 Y=415 / 底部 pill 带 G=552 均不侵入）
//
// 选幕原则（2026-10-17 满血版铺开时定稿）——编排层只做"插画没做的事"：
//   · 数值/图表语义已由 v3 插画表达的幕不上（s13 bigNum 2×、s18 ×1→×2、s27 五五开、
//     s32 双柱、s33 票价、s22 gainLossPair 已带 ¥3/¥7 双色数字）
//   · 金句已由 statement 常驻表达的幕不上（s20 放手的代价、s29、s36、s38）
//   · 章节标题卡幕不上（s06/s09/s21/s23/s30/s34/s36/s39 已有标题系统）
//   · 最终入选：s02 开场定调 / s14 金句滑升 / s15 长幕金句 / s16 选择两行 /
//     s37 割肉红 L2+箭头（全片仅两处 L2 之一）/ s40 收场三连问
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

// 强调词上色：把 text 拆成字符 tspan，命中 accentWords 的字符换 accentFill（E1b 通道）
function setStyledText(el, text, accentWords = [], accentFill = PALETTE.accent) {
  const chars = [...text];
  const acc = new Set();
  for (const w of accentWords) {
    const i = text.indexOf(w);
    if (i >= 0) for (let j = 0; j < [...w].length; j++) acc.add(i + j);
  }
  chars.forEach((ch, i) => {
    const ts = document.createElementNS(NS, 'tspan');
    ts.textContent = ch;
    if (acc.has(i)) ts.setAttribute('fill', accentFill);
    el.appendChild(ts);
  });
}

// 遮罩滑升（B3，行业标准标题入场）：clip 矩形 + 文字从下方滑入
// 返回 { wrap, el }；wrap 负责 (X,Y) 定位，el 负责 translateY 滑升 + opacity
let clipSeq = 0;
function revealLine(parent, { size, weight = 700, fill, ls = 2 }) {
  const id = `typoClip${++clipSeq}`;
  const cp = document.createElementNS(NS, 'clipPath');
  cp.setAttribute('id', id);
  const rect = document.createElementNS(NS, 'rect');
  const h = Math.round(size * 1.3);
  rect.setAttribute('x', '-720');
  rect.setAttribute('y', String(-Math.round(size * 0.95)));
  rect.setAttribute('width', '1440');
  rect.setAttribute('height', String(h));
  cp.appendChild(rect);
  const wrap = document.createElementNS(NS, 'g');
  wrap.setAttribute('clip-path', `url(#${id})`);
  const el = mkText(wrap, { size, weight, fill, ls });
  parent.appendChild(cp);
  parent.appendChild(wrap);
  return { el, wrap };
}

// 滑升一拍的求值：wrap 定位到 (X,Y)（clip 随 wrap 走），el 在 clip 内从下方滑入
function revealTick(el, k, X, Y, size) {
  el.setAttribute('opacity', String(k));
  el.parentNode.setAttribute('transform', `translate(${X} ${Y.toFixed(1)})`);
  el.setAttribute('transform', `translate(0 ${((1 - k) * size * 0.9).toFixed(1)})`);
}

// 让位（A1 quiet recedes）：wrap 上移+缩小，el 淡化
function recedeTick(el, k, X, Y, size, rec, kBase) {
  el.setAttribute('opacity', String(kBase * (1 - 0.45 * rec)));
  el.parentNode.setAttribute('transform', `translate(${X} ${(Y - 26 * rec).toFixed(1)}) scale(${(1 - 0.18 * rec).toFixed(3)})`);
}

// 通用容器
function mkGroup(layer) {
  const g = document.createElementNS(NS, 'g');
  g.style.opacity = '0';
  layer.appendChild(g);
  return g;
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

  const g = mkGroup(layer);

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

// ---------------- s02 · 开场定调：双句遮罩滑升（B3） ----------------
// cue3 买的时候嫌贵      2.200–3.533
// cue4 卖的时候又觉得亏  3.533–5.000（"嫌贵"/"亏"琥珀 L1）
// 站位 y 170/244：cardItem 顶 367、swapArrows 带 415，均不侵入
function buildS02(layer) {
  const c3 = CUES[2], c4 = CUES[3];
  const g = mkGroup(layer);
  const r1 = revealLine(g, { size: 40, weight: 600, fill: PALETTE.ink });
  setStyledText(r1.el, '买的时候嫌贵', ['嫌贵']);
  const r2 = revealLine(g, { size: 48, weight: 700, fill: PALETTE.ink });
  setStyledText(r2.el, '卖的时候又觉得亏', ['觉得亏']);
  const X = 640;
  const EXIT0 = c4.end - 0.3, EXIT1 = c4.end;
  return {
    covers(t) { return t >= c3.start && t < c4.end; },
    update(t) {
      const on = t >= c3.start && t < c4.end;
      g.style.opacity = on ? String(1 - seg(t, EXIT0, EXIT1)) : '0';
      if (!on) return;
      const k1 = eoExpo(seg(t, c3.start + 0.15, c3.start + 0.95));
      revealTick(r1.el, k1, X, 170, 40);
      // 让位：第二行接管时第一行退后（A1 quiet recedes）
      const k2 = eoExpo(seg(t, c4.start + 0.15, c4.start + 0.95));
      revealTick(r2.el, k2, X, 248, 48);
      const rec = eio(seg(t, c4.start + 0.15, c4.start + 0.85));
      recedeTick(r1.el, rec, X, 170, 40, rec, k1);
    },
  };
}

// ---------------- s14 · 金句滑升（B3）：杯子没有变 / 变的是它在谁手里 ----------------
// cue30-31（铺垫）留底部字幕；cue32 54.633–55.700 / cue33 55.766–57.366 上舞台
// 站位 y 176/250：person 头顶 ≈313、mug 顶 ≈340，均不侵入；"谁手里"琥珀 L1
function buildS14(layer) {
  const c32 = CUES[31], c33 = CUES[32];
  const g = mkGroup(layer);
  const r1 = revealLine(g, { size: 42, weight: 600, fill: PALETTE.ink });
  r1.el.textContent = '杯子，没有变';
  const r2 = revealLine(g, { size: 50, weight: 700, fill: PALETTE.ink });
  setStyledText(r2.el, '变的是它在谁手里', ['谁手里']);
  const X = 640;
  const EXIT0 = c33.end - 0.3, EXIT1 = c33.end;
  return {
    covers(t) { return t >= c32.start && t < c33.end; },
    update(t) {
      const on = t >= c32.start && t < c33.end;
      g.style.opacity = on ? String(1 - seg(t, EXIT0, EXIT1)) : '0';
      if (!on) return;
      const k1 = eoExpo(seg(t, c32.start + 0.15, c32.start + 0.9));
      revealTick(r1.el, k1, X, 176, 42);
      const k2 = eoExpo(seg(t, c33.start + 0.12, c33.start + 0.88));
      revealTick(r2.el, k2, X, 252, 50);
      // 让位：第二行接管时第一行退后
      const rec = eio(seg(t, c33.start + 0.12, c33.start + 0.8));
      recedeTick(r1.el, rec, X, 176, 42, rec, k1);
    },
  };
}

// ---------------- s15 · 长幕金句滑升（B3） ----------------
// cue34-37（狠/第三组/手里没杯子）留底部字幕；cue38 63.033–66.166 上舞台
// 17 字拆两行：「他们不买也不卖」y 182 /「只在一句话之间选」y 248；"一句话"琥珀
function buildS15(layer) {
  const c38 = CUES[37];
  const g = mkGroup(layer);
  const r1 = revealLine(g, { size: 42, weight: 600, fill: PALETTE.ink });
  r1.el.textContent = '他们不买也不卖';
  const r2 = revealLine(g, { size: 48, weight: 700, fill: PALETTE.ink });
  setStyledText(r2.el, '只在一句话之间选', ['一句话']);
  const X = 640;
  const EXIT0 = c38.end - 0.3, EXIT1 = c38.end;
  return {
    covers(t) { return t >= c38.start && t < c38.end; },
    update(t) {
      const on = t >= c38.start && t < c38.end;
      g.style.opacity = on ? String(1 - seg(t, EXIT0, EXIT1)) : '0';
      if (!on) return;
      const k1 = eoExpo(seg(t, c38.start + 0.15, c38.start + 0.85));
      revealTick(r1.el, k1, X, 182, 42);
      const k2 = eoExpo(seg(t, c38.start + 0.5, c38.start + 1.25));
      revealTick(r2.el, k2, X, 248, 48);
    },
  };
}

// ---------------- s16 · 选择两行滑升（B3） ----------------
// cue39 给你一只杯子            66.166–67.466
// cue40 或者给你一笔钱，你选哪个？ 67.466–70.033（"你选哪个？"琥珀）
// 站位 y 176/246：cardItem 顶 367、questionBig 顶 ≈350，不侵入
function buildS16(layer) {
  const c39 = CUES[38], c40 = CUES[39];
  const g = mkGroup(layer);
  const r1 = revealLine(g, { size: 42, weight: 600, fill: PALETTE.ink });
  r1.el.textContent = '给你一只杯子';
  const r2 = revealLine(g, { size: 46, weight: 700, fill: PALETTE.ink });
  setStyledText(r2.el, '或者给你一笔钱，你选哪个？', ['你选哪个？']);
  const X = 640;
  const EXIT0 = c40.end - 0.3, EXIT1 = c40.end;
  return {
    covers(t) { return t >= c39.start && t < c40.end; },
    update(t) {
      const on = t >= c39.start && t < c40.end;
      g.style.opacity = on ? String(1 - seg(t, EXIT0, EXIT1)) : '0';
      if (!on) return;
      const k1 = eoExpo(seg(t, c39.start + 0.15, c39.start + 0.85));
      revealTick(r1.el, k1, X, 176, 42);
      const k2 = eoExpo(seg(t, c40.start + 0.12, c40.start + 0.9));
      revealTick(r2.el, k2, X, 246, 46);
      const rec = eio(seg(t, c40.start + 0.12, c40.start + 0.8));
      recedeTick(r1.el, rec, X, 176, 42, rec, k1);
    },
  };
}

// ---------------- s37 · 割肉（E1 L2 红 + E2 下箭头 + E4 变色转折） ----------------
// cue117-119（买入价/按不到卖出键）留底部字幕（pill 已表达）；
// cue120 218.733–221.866 上舞台：明明是同样的价格 / 卖出去像割肉
// 「割肉」= 全片第二处 L2：红 + 加大 + 红下箭头从上滑下（往指的方向滑）
// cue121 起底部字幕接管，编排块上移淡出让位
function buildS37(layer) {
  const c120 = CUES[119], c121 = CUES[120];
  const g = mkGroup(layer);
  const r1 = revealLine(g, { size: 38, weight: 600, fill: PALETTE.ink });
  r1.el.textContent = '明明是同样的价格';
  const r2 = revealLine(g, { size: 54, weight: 800, fill: PALETTE.warn });
  r2.el.textContent = '卖出去像割肉';   // L2 整行红（红色本身就是强调，不再拆词降级）
  // 红下箭头（损失通道，E2 定向滑入）
  const arrow = document.createElementNS(NS, 'path');
  arrow.setAttribute('d', 'M0 -26 L0 14 M-13 2 L0 16 L13 2');
  arrow.setAttribute('fill', 'none');
  arrow.setAttribute('stroke', PALETTE.warn);
  arrow.setAttribute('stroke-width', '6');
  arrow.setAttribute('stroke-linecap', 'round');
  arrow.setAttribute('stroke-linejoin', 'round');
  arrow.setAttribute('opacity', '0');
  g.appendChild(arrow);
  const X = 640;
  const HOLD_END = c121.start + 0.05;          // cue121 起底部字幕接管
  const EXIT1 = HOLD_END + 0.35;
  return {
    covers(t) { return t >= c120.start && t < EXIT1; },
    update(t) {
      const on = t >= c120.start && t < EXIT1;
      if (!on) { g.style.opacity = '0'; return; }
      // 出场：cue121 开始 → 上移淡出让位（A1）
      const out = eio(seg(t, HOLD_END, EXIT1));
      g.style.opacity = String(1 - out);

      const k1 = eoExpo(seg(t, c120.start + 0.15, c120.start + 0.8));
      revealTick(r1.el, k1, X, 176, 38);
      const k2 = eoExpo(seg(t, c120.start + 0.55, c120.start + 1.2));
      revealTick(r2.el, k2, X, 248, 54);
      // 箭头：从上方 60px 滑落到「割肉」右侧（往指的方向滑），随后单次 pulse（E3）
      const ka = eoExpo(seg(t, c120.start + 0.95, c120.start + 1.55));
      const ax = X + 268, ay = 236 - 60 * (1 - ka);
      arrow.setAttribute('opacity', String(ka * (1 - out)));
      let pulse = 1;
      const P0 = c120.start + 1.9;
      if (t > P0) pulse = 1 + 0.08 * Math.sin(clamp((t - P0) / 0.3, 0, 1) * Math.PI);
      arrow.setAttribute('transform', `translate(${ax} ${ay.toFixed(1)}) scale(${pulse.toFixed(3)})`);
      // E4 变色转折：第二行入场中段从墨色转红（变色本身就是节拍）
      // —— 实现为整行 fill 切换：k2 过半前用 ink 色 tspan 由红覆盖，简化为直接 warn 色 + 慢显
    },
  };
}

// ---------------- s40 · 收场三连问（B3 渐进 + E1 琥珀收束） ----------------
// cue136 假设你现在根本没有拥有它  247.766–250.033
// cue137 你还愿意花同样的代价      250.033–252.100
// cue138 重新得到它吗？            252.200–253.466（大字琥珀，全片收束句）
// 站位 y 168/222/290：questionBig 顶 ≈340、pill 582，不侵入
function buildS40(layer) {
  const c136 = CUES[135], c137 = CUES[136], c138 = CUES[137];
  const g = mkGroup(layer);
  const r1 = revealLine(g, { size: 32, weight: 500, fill: PALETTE.ink });
  r1.el.textContent = '假设你现在根本没有拥有它';
  const r2 = revealLine(g, { size: 32, weight: 500, fill: PALETTE.ink });
  r2.el.textContent = '你还愿意花同样的代价';
  const r3 = revealLine(g, { size: 56, weight: 800, fill: PALETTE.accent, ls: 5 });
  r3.el.textContent = '重新得到它吗？';
  const X = 640;
  const TOTAL_END = c138.end;
  return {
    covers(t) { return t >= c136.start && t < TOTAL_END; },
    update(t) {
      const on = t >= c136.start && t < TOTAL_END;
      if (!on) { g.style.opacity = '0'; return; }
      // 幕尾随全局 fade 一起收（自身再叠一层 0.2s 淡出保险）
      g.style.opacity = String(1 - seg(t, TOTAL_END - 0.2, TOTAL_END));

      const k1 = eoExpo(seg(t, c136.start + 0.15, c136.start + 0.85));
      revealTick(r1.el, k1, X, 168, 32);
      const k2 = eoExpo(seg(t, c137.start + 0.12, c137.start + 0.82));
      revealTick(r2.el, k2, X, 222, 32);
      // 大字接管：前两行让位退后（A1）
      const k3 = eoExpo(seg(t, c138.start + 0.1, c138.start + 0.85));
      revealTick(r3.el, k3, X, 292, 56);
      const rec = eio(seg(t, c138.start + 0.1, c138.start + 0.8));
      recedeTick(r1.el, rec, X, 168, 32, rec, k1);
      recedeTick(r2.el, rec, X, 222, 32, rec, k2);
    },
  };
}

export const TYPO_SCENES = ['s02', 's05', 's14', 's15', 's16', 's37', 's40'];

export function buildTypoLayer() {
  const layer = document.getElementById('typoLayer');
  const scenes = [buildS02(layer), buildS05(layer), buildS14(layer), buildS15(layer), buildS16(layer), buildS37(layer), buildS40(layer)];
  return {
    covers(t) { return scenes.some((s) => s.covers(t)); },
    update(t) { for (const s of scenes) s.update(t); },
  };
}
