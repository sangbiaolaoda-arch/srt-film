// typography.js — 文字编排层（v2.6 → v2.7 全片铺开 → v2.10 全幕级联）
// 法则来源：20261017_text_choreography/final/文字编排法则.md（七类 37 式，联网查证）
// 实现约定：全部"时间的函数"求值（seg/ease + t），不用 tween —— 逐帧 seek 绝对可复现
// 硬约束：一次只动 1-2 个元素；入场 easeOutExpo；行错峰 ≥0.24s；词义驱动动效；
//         站位避开主体带 Y=415 / pill 带 G=552（上部自由带 + 标题幕中带）
//
// v2.10（用户指令：字幕不出现在底部，全部舞台元素化）：
//   · 底部字幕条全面退役，138 条 cue 全部上舞台
//   · 7 幕手工编排保留（s02/s05/s14/s15/s16/s37/s40），其余 33 幕走自动引擎
//   · 自动引擎 = 级联站位 + 语义入场（遮罩滑升/逐字错峰/pop/打字机）
//     + 大小层级（Anchor 38 → Active 44 → Payoff 52）+ E1b 颜色通道
//     + F 类语义图标库（13 个描边 glyph，入场方式跟语义）
import { PALETTE } from './palette.js';
import { CUES, SCENES } from './storyboard.js';

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

// 强调词上色（多色标记版）：marks = [{ w, fill }]，命中字符换色
function setStyledTextMarks(el, text, marks) {
  const chars = [...text];
  const colorAt = new Map();
  for (const { w, fill } of marks) {
    const i = text.indexOf(w);
    if (i >= 0) for (let j = 0; j < [...w].length; j++) colorAt.set(i + j, fill);
  }
  chars.forEach((ch, i) => {
    const ts = document.createElementNS(NS, 'tspan');
    ts.textContent = ch;
    if (colorAt.has(i)) ts.setAttribute('fill', colorAt.get(i));
    el.appendChild(ts);
  });
}

// 兼容旧签名：单色强调
function setStyledText(el, text, accentWords = [], accentFill = PALETTE.accent) {
  setStyledTextMarks(el, text, accentWords.map((w) => ({ w, fill: accentFill })));
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

// ================= s05 · 上下站位让位（用户 2026-10-17 原例接入真实字幕） =================
function buildS05(layer) {
  const c8 = CUES[7], c9 = CUES[8];
  const TYPE_T0 = c8.start + 0.2, STEP = 0.13;
  const REC0 = c8.end + 0.07, REC1 = REC0 + 0.65;
  const L1_T0 = c9.start + 0.17, L1_DUR = 0.55;
  const L2_T0 = L1_T0 + 0.3, L2_DUR = 0.9;
  const EXIT0 = c9.end - 0.32, EXIT1 = c9.end;

  const g = mkGroup(layer);
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

      const shown = clamp(Math.floor((t - TYPE_T0) / STEP) + 1, 0, spans.length);
      spans.forEach((sp, i) => sp.setAttribute('opacity', i < shown ? '1' : '0'));

      const k = eio(seg(t, REC0, REC1));
      const y1 = 182 - 54 * k, s1 = 1 - 0.38 * k, o1 = 1 - 0.55 * k;
      l1.setAttribute('opacity', String(o1));
      l1.setAttribute('transform', `translate(${X} ${y1.toFixed(1)}) scale(${s1.toFixed(3)})`);

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

      const p2 = eoExpo(seg(t, L1_T0, L1_T0 + L1_DUR));
      l2.setAttribute('opacity', String(p2));
      l2.setAttribute('transform', `translate(${X} ${(196 + (1 - p2) * 24).toFixed(1)})`);

      const p3 = easeInQuad(seg(t, L2_T0, L2_T0 + L2_DUR));
      l3.setAttribute('opacity', String(p3));
      l3.setAttribute('transform', `translate(${X} ${(272 + (1 - p3) * 14).toFixed(1)}) scale(${(0.55 + 0.45 * p3).toFixed(3)})`);
    },
  };
}

// ================= s02 · 开场定调：双句遮罩滑升（B3） =================
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
      const k2 = eoExpo(seg(t, c4.start + 0.15, c4.start + 0.95));
      revealTick(r2.el, k2, X, 248, 48);
      const rec = eio(seg(t, c4.start + 0.15, c4.start + 0.85));
      recedeTick(r1.el, rec, X, 170, 40, rec, k1);
    },
  };
}

// ================= s14 · 金句滑升（B3）：杯子没有变 / 变的是它在谁手里 =================
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
      const rec = eio(seg(t, c33.start + 0.12, c33.start + 0.8));
      recedeTick(r1.el, rec, X, 176, 42, rec, k1);
    },
  };
}

// ================= s15 · 长幕金句滑升（B3） =================
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

// ================= s16 · 选择两行滑升（B3） =================
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

// ================= s37 · 割肉（E1 L2 红 + E2 下箭头 + E4 变色转折） =================
function buildS37(layer) {
  const c120 = CUES[119], c121 = CUES[120];
  const g = mkGroup(layer);
  const r1 = revealLine(g, { size: 38, weight: 600, fill: PALETTE.ink });
  r1.el.textContent = '明明是同样的价格';
  const r2 = revealLine(g, { size: 54, weight: 800, fill: PALETTE.warn });
  r2.el.textContent = '卖出去像割肉';
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
  const HOLD_END = c121.start + 0.05;
  const EXIT1 = HOLD_END + 0.35;
  return {
    covers(t) { return t >= c120.start && t < EXIT1; },
    update(t) {
      const on = t >= c120.start && t < EXIT1;
      if (!on) { g.style.opacity = '0'; return; }
      const out = eio(seg(t, HOLD_END, EXIT1));
      g.style.opacity = String(1 - out);

      const k1 = eoExpo(seg(t, c120.start + 0.15, c120.start + 0.8));
      revealTick(r1.el, k1, X, 176, 38);
      const k2 = eoExpo(seg(t, c120.start + 0.55, c120.start + 1.2));
      revealTick(r2.el, k2, X, 248, 54);
      const ka = eoExpo(seg(t, c120.start + 0.95, c120.start + 1.55));
      const ax = X + 268, ay = 236 - 60 * (1 - ka);
      arrow.setAttribute('opacity', String(ka * (1 - out)));
      let pulse = 1;
      const P0 = c120.start + 1.9;
      if (t > P0) pulse = 1 + 0.08 * Math.sin(clamp((t - P0) / 0.3, 0, 1) * Math.PI);
      arrow.setAttribute('transform', `translate(${ax} ${ay.toFixed(1)}) scale(${pulse.toFixed(3)})`);
    },
  };
}

// ================= s40 · 收场三连问（B3 渐进 + E1 琥珀收束） =================
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
      g.style.opacity = String(1 - seg(t, TOTAL_END - 0.2, TOTAL_END));

      const k1 = eoExpo(seg(t, c136.start + 0.15, c136.start + 0.85));
      revealTick(r1.el, k1, X, 168, 32);
      const k2 = eoExpo(seg(t, c137.start + 0.12, c137.start + 0.82));
      revealTick(r2.el, k2, X, 222, 32);
      const k3 = eoExpo(seg(t, c138.start + 0.1, c138.start + 0.85));
      revealTick(r3.el, k3, X, 292, 56);
      const rec = eio(seg(t, c138.start + 0.1, c138.start + 0.8));
      recedeTick(r1.el, rec, X, 168, 32, rec, k1);
      recedeTick(r2.el, rec, X, 222, 32, rec, k2);
    },
  };
}

// ============================================================================
// ============ 自动编排引擎（v2.10）：其余 33 幕 129 条 cue 级联上舞台 ============
// ============================================================================

// 琥珀强调词（与全片字幕强调系统同源）
const ACCENT_WORDS = [
  '禀赋效应', '两倍', '翻倍', '损失厌恶', '科斯定理', '失效',
  '九成', '一半一半', '七天无理由', '闲鱼', '两千多', '一百多', '不是命', '是生疏',
  '舍不得', '值得', '自检', '买入价', '卖出', '贴着买家', '价差会消失', '磨薄',
  '凭空多出一倍', '最低多少钱', '最高多少钱',
];
const WARN_WORDS = ['割肉', '失去', '看走了眼'];   // E1b 砖红通道（每幕限一处，稀缺性契约）
const COOL_WORDS = ['得到', '肯买', '自由交易'];   // 青色正面/信息通道
const NUM_RE = /[0-9]/;                            // 数字 → pop + 琥珀

// ---- F 类语义图标库（描边风，40px 盒，stroke 5 round；入场方式跟语义 E2） ----
function mkGlyph(kind, color) {
  const el = document.createElementNS(NS, 'g');
  const stroke = { fill: 'none', stroke: color, 'stroke-width': '5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  const add = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    Object.entries(stroke).forEach(([k, v]) => e.setAttribute(k, v));
    el.appendChild(e);
  };
  let enter = 'pop';
  if (kind === 'down')      { add('path', { d: 'M0 -20 L0 14 M-13 2 L0 16 L13 2' }); enter = 'down'; }
  else if (kind === 'up')   { add('path', { d: 'M0 20 L0 -14 M-13 -2 L0 -16 L13 -2' }); enter = 'up'; }
  else if (kind === 'ban')  { add('circle', { r: 18 }); add('path', { d: 'M-12 -12 L12 12' }); enter = 'stamp'; }
  else if (kind === 'check'){ add('path', { d: 'M-13 2 L-4 12 L14 -12' }); enter = 'stamp'; }
  else if (kind === 'cross'){ add('path', { d: 'M-11 -11 L11 11 M11 -11 L-11 11' }); enter = 'stamp'; }
  else if (kind === 'clock'){ add('circle', { r: 18 }); add('path', { d: 'M0 -9 L0 0 L8 5' }); }
  else if (kind === 'lock') { add('rect', { x: -13, y: -2, width: 26, height: 18, rx: 3 }); add('path', { d: 'M-8 -2 L-8 -8 A8 8 0 0 1 8 -8 L8 -2' }); enter = 'down'; }
  else if (kind === 'heart'){ add('path', { d: 'M0 14 C-20 0 -14 -18 0 -8 C14 -18 20 0 0 14 Z' }); enter = 'pop'; }
  else if (kind === 'eye')  { add('path', { d: 'M-19 0 Q0 -17 19 0 Q0 17 -19 0 Z' }); add('circle', { r: 4.5 }); }
  else if (kind === 'exchange') { add('path', { d: 'M-16 -7 L14 -7 M7 -14 L14 -7 L7 0' }); add('path', { d: 'M16 9 L-14 9 M-7 2 L-14 9 L-7 16' }); enter = 'stamp'; }
  else if (kind === 'half') { add('circle', { r: 17 }); const p = document.createElementNS(NS, 'path'); p.setAttribute('d', 'M0 -17 A17 17 0 0 1 0 17 Z'); p.setAttribute('fill', color); p.setAttribute('fill-opacity', '0.45'); p.setAttribute('stroke', 'none'); el.appendChild(p); enter = 'stamp'; }
  else { /* 徽章类：文字 */ }
  el.setAttribute('opacity', '0');
  return { el, enter };
}
// 文字徽章（×2 / 9/10）：G 类数据语义的小型化
function mkBadge(kind, color) {
  const el = mkText(document.createElementNS(NS, 'g'), { size: kind === 'x2' ? 34 : 26, weight: 800, fill: color, ls: 0 });
  el.textContent = kind === 'x2' ? '×2' : '9/10';
  const box = el.parentNode;
  box.setAttribute('opacity', '0');
  return { el: box, enter: 'stamp' };
}

// 关键词 → 图标触发表（F4 语义映射；每 cue 最多一个图标，先命中先用）
const ICON_TRIGGERS = [
  ['割肉', 'down', PALETTE.warn], ['失去', 'down', PALETTE.warn], ['看走了眼', 'cross', PALETTE.warn],
  ['得到', 'up', PALETTE.cool], ['肯买', 'up', PALETTE.cool],
  ['不肯', 'ban', PALETTE.warn], ['失效', 'ban', PALETTE.warn],
  ['过期作废', 'clock', PALETTE.warn], ['十分钟', 'clock', PALETTE.inkDim], ['几分钟', 'clock', PALETTE.inkDim],
  ['拥有', 'lock', PALETTE.cool],
  ['舍不得', 'heart', PALETTE.warn],
  ['自检', 'check', PALETTE.accent], ['问自己', 'eye', PALETTE.cool],
  ['两倍', 'x2', PALETTE.accent], ['翻倍', 'x2', PALETTE.accent], ['翻上天', 'x2', PALETTE.accent], ['多出一倍', 'x2', PALETTE.accent],
  ['一半一半', 'half', PALETTE.accent], ['九成', 'n910', PALETTE.accent],
  ['自由交易', 'exchange', PALETTE.cool],
];

// 长句拆行：只在标点处拆（避免切词）；无标点长句保持单行
function splitLines(text) {
  if ([...text].length <= 12) return [text];
  const punct = ['，', '：', '、', '；'];
  const chars = [...text];
  let best = -1, bestD = 1e9;
  chars.forEach((ch, i) => {
    if (punct.includes(ch)) {
      const d = Math.abs(i - chars.length / 2);
      if (d < bestD) { bestD = d; best = i; }
    }
  });
  if (best < 3 || best > chars.length - 4) return [text];   // 无合适标点 → 单行
  return [chars.slice(0, best + 1).join('').trim(), chars.slice(best + 1).join('').trim()];
}

// ---- 每幕编排配置 ----
// slots: 级联槽位（cue i 用 slots[i % n]，旧句让位后槽位复用）
// base/payoffSize: 字号体系；scale: 大字插画幕的整体缩放
// payoff: 收束句 cue id（默认 cues 最后一条；false = 无）
// payoffInk: 收束句不上琥珀（标题已表达同一词时）
// handFrom: 本幕第 N 条 cue 起由手工块接管（auto 在此前的 cue 提前退场）
// handUntil: 手工块完全退场的时刻偏移（auto 后半段在此之后才进场）
// noIcons: 大字插画已表达语义的幕关图标
const AUTO_CFG = {
  s01: { cues: [1, 2] },
  s03: { cues: [5], slots: [298] },                                // 气泡框底 ≈249，下移让位
  s04: { cues: [6, 7] },
  s06: { cues: [10, 11], title: true, payoffInk: true, slots: [330] },  // 单槽在杯子下方（顶≈300），顺序交接
  s07: { cues: [12], slots: [224] },
  s08: { cues: [13, 16] },                                         // 14-15 由插画 statement（不是命，是生疏）表达
  s09: { cues: [17, 18, 19], title: true, slots: [232], payoffSize: 38 },  // 校园屋顶顶 ≈257，单槽顺序交接
  s10: { cues: [20, 21], slots: [150, 215] },                      // 杯子特写顶 324
  s11: { cues: [22, 23] },
  s12: { cues: [24, 25, 26] },
  s13: { cues: [27, 28, 29], scale: 0.82, slots: [140, 198, 254], noIcons: true },  // 大数字 2×
  s14: { cues: [30, 31], handFrom: 32 },                           // 32-33 手工
  s15: { cues: [34, 35, 36, 37], handFrom: 38 },                   // 38 手工
  s17: { cues: [41, 42, 43] },
  s18: { cues: [44, 45], scale: 0.88, slots: [146, 210], noIcons: true },           // ×1→×2
  s19: { cues: [46, 47, 48] },
  s20: { cues: [49, 50, 51], scale: 0.82, slots: [138, 194, 250], noIcons: true },  // 52 由 statement 表达
  s21: { cues: [53, 54, 55, 56, 57, 58], title: true, payoff: 58 },
  s22: { cues: [59, 60, 61, 62], scale: 0.9, slots: [150, 214, 276], noIcons: true },  // ¥3/¥7 已表达
  s23: { cues: [63, 64, 65, 66, 67, 68, 69], title: true, slots: [230, 280] },  // 科斯定理卡顶 ≈311
  s24: { cues: [70, 71, 72] },
  s25: { cues: [73, 74, 75, 76] },
  s26: { cues: [77, 78, 79], slots: [104, 160] },                  // 盖章圈顶 ≈205，payoff 走顶部双槽
  s27: { cues: [80, 81, 82], scale: 0.9, slots: [150, 214, 276], noIcons: true },      // 五五开 donut
  s28: { cues: [83, 84, 85] },
  s29: { cues: [86, 87], scale: 0.85, slots: [142, 204], noIcons: true },              // statement 失效
  s30: { cues: [88, 89, 90, 91, 92], title: true, payoff: 92 },
  s31: { cues: [93, 94], slots: [138, 220] },                      // 双行与 payoff 拉开间距
  s32: { cues: [95, 96, 97, 98], scale: 0.85, slots: [134, 192, 262], noIcons: true }, // 双柱图
  s33: { cues: [99, 100, 101, 102], scale: 0.85, slots: [138, 196, 252] },
  s34: { cues: [103, 104, 105, 106, 107], title: true },
  s35: { cues: [108, 109, 110, 111, 112, 113], payoff: 113, slots: [140, 200, 262] },  // 收束句避开卡片顶 313
  s36: { cues: [114, 115], title: true },                          // 116 由插画 statement 表达
  s37: { cues: [117, 118, 119, 121, 122, 123], handFrom: 120, handUntilPad: 0.45, slots: [150, 214], noWarn: true }, // 本幕红归手工 L2
  s38: { cues: [124, 125, 126, 127, 128, 130], payoff: 130 },      // 129 由 statement 表达
  s39: { cues: [131, 132, 133, 134, 135], title: true, x: 950 },   // 便签卡在左中，编排走右列
};

function buildAuto(key, cfg, layer) {
  const scene = SCENES.find((s) => s.key === key);
  const X = cfg.x || 640;   // 站位列中心（插画居中占位时可用右列/左列避开）
  // 标题幕槽位必须让开标题卡（kicker y132 + 标题 y186，底 ≈210）：中带 240/292
  const slots = cfg.slots || (cfg.title ? [240, 292] : [148, 226, 298]);
  const base = (cfg.title ? 32 : 38) * (cfg.scale || 1);
  const payoffSize = cfg.payoffSize || ((cfg.title ? 44 : 52) * (cfg.scale ? Math.max(0.9, cfg.scale) : 1));
  const payoffId = cfg.payoff === undefined ? cfg.cues[cfg.cues.length - 1] : cfg.payoff;
  const handFromStart = cfg.handFrom ? CUES[cfg.handFrom - 1].start : null;
  const handUntil = cfg.handFrom ? CUES[cfg.handFrom - 1].start + (cfg.handUntilPad || 0.35) : null;
  let warnUsed = false;

  // ---- 预建每个 cue 的 DOM 单元 ----
  const units = cfg.cues.map((id, i) => {
    const cue = CUES[id - 1];
    const isPayoff = id === payoffId;
    const enter0 = cue.start + 0.12;
    const lines = isPayoff ? [cue.text] : splitLines(cue.text);
    const size = isPayoff ? payoffSize : base;
    const g = mkGroup(layer);

    // 语义配色 marks（E1b 通道；warn 每幕一次）
    let unitWarn = false;
    const marks = [];
    for (const w of ACCENT_WORDS) if (cue.text.includes(w)) { marks.push({ w, fill: PALETTE.accent }); break; }
    for (const w of COOL_WORDS) if (cue.text.includes(w)) { marks.push({ w, fill: PALETTE.cool }); break; }
    if (!warnUsed && !cfg.noWarn) for (const w of WARN_WORDS) {
      if (cue.text.includes(w)) { marks.push({ w, fill: PALETTE.warn }); unitWarn = true; break; }
    }
    if (unitWarn) warnUsed = true;

    // 入场风格（词义驱动）：引语→打字机；数字→pop；长句→逐字错峰；默认遮罩滑升
    const style = /[""]/.test(cue.text) ? 'type' : (NUM_RE.test(cue.text) ? 'pop' : ([...cue.text].length >= 10 ? 'stagger' : 'reveal'));

    // 图标（F 类触发）
    let icon = null, iconKind = null, iconColor = null;
    if (!cfg.noIcons && !unitWarn) {
      for (const [w, kind, color] of ICON_TRIGGERS) {
        if (cue.text.includes(w)) { iconKind = kind; iconColor = color; break; }
      }
      if (iconKind) {
        icon = (iconKind === 'x2' || iconKind === 'n910') ? mkBadge(iconKind, iconColor) : mkGlyph(iconKind, iconColor);
        g.appendChild(icon.el);
      }
    }
    if (unitWarn && !cfg.noIcons) {
      for (const [w, kind, color] of ICON_TRIGGERS) {
        if (WARN_WORDS.includes(w) && cue.text.includes(w)) { iconKind = kind; iconColor = color; break; }
      }
      if (iconKind) { icon = mkGlyph(iconKind, iconColor); g.appendChild(icon.el); }
    }

    // 每行 DOM（双行时收缩字号：行1 = size-2，行2 = size-10，避免与下一槽位相撞）
    const twoLine = lines.length === 2;
    const gap = twoLine ? Math.round((size - 2) * 0.6) + 11 : 0;
    const lineEls = lines.map((ln, li) => {
      const ls = isPayoff ? 4 : 2;
      const weight = isPayoff ? 800 : (li === 0 ? 600 : 500);
      const fill = isPayoff ? (cfg.payoffInk ? PALETTE.ink : PALETTE.accent) : PALETTE.ink;
      const lsize = twoLine ? (li === 0 ? size - 2 : Math.max(24, size - 10)) : size;
      if (style === 'reveal' || style === 'pop') {
        const el = mkText(g, { size: lsize, weight, fill, ls });
        if (marks.length) setStyledTextMarks(el, ln, marks); else el.textContent = ln;
        return { el, kind: style };
      }
      // type / stagger：字符 tspan
      const el = mkText(g, { size: lsize, weight, fill, ls });
      const spans = [];
      for (const ch of [...ln]) {
        const ts = document.createElementNS(NS, 'tspan');
        ts.textContent = ch;
        const mark = marks.find(({ w }) => false); // 字符级着色在下方统一处理
        ts.setAttribute('opacity', '0');
        el.appendChild(ts);
        spans.push(ts);
      }
      // 字符级配色：命中 marks 的字符换 fill
      const colorAt = new Map();
      for (const { w, fill: f } of marks) {
        const at = ln.indexOf(w);
        if (at >= 0) for (let j = 0; j < [...w].length; j++) colorAt.set(at + j, f);
      }
      spans.forEach((ts, ci) => { if (colorAt.has(ci)) ts.setAttribute('fill', colorAt.get(ci)); });
      return { el, kind: style, spans };
    });

    const y0 = slots[i % slots.length];
    return { cue, id, i, g, lines, lineEls, y0, size, gap, isPayoff, enter0, style, icon, iconKind, exitCap: cfg.exitAt ? cfg.exitAt[id] : null };
  });

  return {
    covers(t) { return t >= scene.start && t < scene.end; },
    update(t) {
      const sceneEnd = scene.end;
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        // 进场保护（手工块接管期间的 cue 推迟进场）
        let enter0 = u.enter0;
        if (handUntil && u.id > (cfg.handFrom || 0)) enter0 = Math.max(enter0, handUntil + 0.12);
        // 退场时刻：后面第 2 句进场时彻底淡出；下一句同槽（含单槽）则顺序交接（先净场再进场）；
        // 有手工块则提前；有显式配置则最优先
        let cap = units[i + 2] ? units[i + 2].enter0 : sceneEnd - 0.35;
        const sameSlotNext = units[i + 1] && slots[(i + 1) % slots.length] === slots[i % slots.length];
        if (units[i + 1] && units[i + 2] && slots[(i + 2) % slots.length] === slots[i % slots.length]) {
          cap = Math.min(cap, units[i + 2].enter0 - 0.24);   // 与后面第 2 句同槽：在它进场前净场
        }
        if (sameSlotNext) cap = Math.min(cap, units[i + 1].enter0 - 0.24);
        if (handFromStart && u.id < cfg.handFrom) cap = Math.min(cap, handFromStart - 0.06);
        if (u.exitCap != null) cap = Math.min(cap, u.exitCap);
        const exitDur = sameSlotNext ? 0.2 : 0.3;
        const exitK = 1 - seg(t, cap, cap + exitDur);
        const on = t >= enter0 - 0.01 && exitK > 0.01;
        if (!on) { u.g.style.opacity = '0'; continue; }

        // 让位：下一句进场时本句退后（A1 quiet recedes）
        const nextEnter = units[i + 1] ? Math.max(units[i + 1].enter0, (handUntil && units[i + 1].id > (cfg.handFrom || 0)) ? handUntil + 0.12 : 0) : null;
        const rec = nextEnter ? eio(seg(t, nextEnter, nextEnter + 0.6)) : 0;

        // 主入场 k
        const dur = 0.55;
        const k = eoExpo(seg(t, enter0, enter0 + dur));
        const lineFade = k * exitK * (1 - 0.45 * rec);
        const s = (1 - 0.14 * rec) * (u.isPayoff ? 0.9 + 0.1 * k : 1);
        u.g.style.opacity = '1';

        u.lineEls.forEach((L, li) => {
          const Y = u.y0 + li * u.gap;
          const lk = L.kind === 'reveal' || L.kind === 'pop'
            ? eoExpo(seg(t, enter0 + li * 0.18, enter0 + li * 0.18 + dur))
            : 1;
          if (L.kind === 'reveal') {
            L.el.setAttribute('opacity', String(lk * exitK * (1 - 0.45 * rec)));
            L.el.parentNode.setAttribute('transform', `translate(${X} ${Y.toFixed(1)})`);
            L.el.setAttribute('transform', `translate(0 ${((1 - lk) * u.size * 0.9).toFixed(1)})`);
          } else if (L.kind === 'pop') {
            const ps = u.isPayoff ? 0.88 + 0.12 * lk : 0.86 + 0.14 * lk;
            L.el.setAttribute('opacity', String(lk * exitK * (1 - 0.45 * rec)));
            L.el.setAttribute('transform', `translate(${X} ${(Y + (1 - lk) * 14).toFixed(1)}) scale(${ps.toFixed(3)})`);
          } else {
            // type / stagger：字符步进
            const step = L.kind === 'type' ? 0.06 : 0.03;
            const n = L.spans.length;
            L.spans.forEach((sp, ci) => {
              const ck = eoExpo(seg(t, enter0 + ci * step, enter0 + ci * step + 0.28));
              sp.setAttribute('opacity', String(ck * lineFade));
            });
            L.el.setAttribute('transform', `translate(${X} ${Y.toFixed(1)})`);
          }
          // 图标（挂在最后一行右侧，入场方式跟语义 E2）
          if (u.icon && li === u.lineEls.length - 1) {
            let half = u.lines[li].length * u.size * 0.55;
            try { half = L.el.getComputedTextLength() / 2; } catch { /* 兜底 */ }
            const ik = eoExpo(seg(t, enter0 + 0.4 + li * 0.18, enter0 + 1.0 + li * 0.18));
            const ix = Math.min(X + half + 44, 1230), iy = Y - u.size * 0.28;
            u.icon.el.setAttribute('opacity', String(ik * exitK * (1 - 0.45 * rec)));
            let tr = '';
            if (u.icon.enter === 'up') tr = `translate(${ix} ${(iy + 36 * (1 - ik)).toFixed(1)})`;
            else if (u.icon.enter === 'down') tr = `translate(${ix} ${(iy - 36 * (1 - ik)).toFixed(1)})`;
            else if (u.icon.enter === 'stamp') tr = `translate(${ix} ${iy.toFixed(1)}) rotate(${(-6 + 6 * ik).toFixed(1)}) scale(${(1.3 - 0.3 * ik).toFixed(3)})`;
            else tr = `translate(${ix} ${iy.toFixed(1)}) scale(${(0.5 + 0.5 * ik).toFixed(3)})`;
            u.icon.el.setAttribute('transform', tr);
          }
        });
      }
    },
  };
}

export const TYPO_SCENES = ['s02', 's05', 's14', 's15', 's16', 's37', 's40'];

export function buildTypoLayer() {
  const layer = document.getElementById('typoLayer');
  const scenes = [
    buildS02(layer), buildS05(layer), buildS14(layer), buildS15(layer), buildS16(layer), buildS37(layer), buildS40(layer),
  ];
  for (const key of Object.keys(AUTO_CFG)) scenes.push(buildAuto(key, AUTO_CFG[key], layer));
  return {
    covers(t) { return scenes.some((s) => s.covers(t)); },
    update(t) { for (const s of scenes) s.update(t); },
  };
}
