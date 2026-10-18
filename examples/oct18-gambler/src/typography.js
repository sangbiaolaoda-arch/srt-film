// typography.js — 文字编排层（v2.6 → v2.10 全幕级联；oct18-gambler 沿用同一引擎）
// 法则来源：20261017_text_choreography/final/文字编排法则.md（七类 37 式，联网查证）
// 实现约定：全部"时间的函数"求值（seg/ease + t），不用 tween —— 逐帧 seek 绝对可复现
// 硬约束：一次只动 1-2 个元素；入场 easeOutExpo；行错峰 ≥0.24s；词义驱动动效；
//         站位避开主体带 Y=415 / pill 带 G=552（上部自由带 + 标题幕中带）
//
// oct18-gambler（81 条 cue / 33 幕）：
//   · 5 幕手工编排（s02 提问 / s10 慢速失血 / s24 差一点 / s31 自白 / s33 收场三连问）
//   · 其余 28 幕走自动引擎（级联站位 + 语义入场 + 大小层级 + E1b 颜色 + F 类图标）
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

// ================= s02 · 开场提问（B3 双行滑升：赢 vs 回本） =================
function buildS02(layer) {
  const c2 = CUES[1];
  const g = mkGroup(layer);
  const r1 = revealLine(g, { size: 34, weight: 500, fill: PALETTE.ink });
  r1.el.textContent = '你觉得他想要的';
  const r2 = revealLine(g, { size: 54, weight: 800, fill: PALETTE.ink });
  setStyledTextMarks(r2.el, '是赢，还是回本？', [
    { w: '赢', fill: PALETTE.cool },
    { w: '回本', fill: PALETTE.accent },
  ]);
  const X = 640;
  const EXIT0 = c2.end - 0.3, EXIT1 = c2.end;
  return {
    covers(t) { return t >= c2.start && t < c2.end; },
    update(t) {
      const on = t >= c2.start && t < c2.end;
      g.style.opacity = on ? String(1 - seg(t, EXIT0, EXIT1)) : '0';
      if (!on) return;
      const k1 = eoExpo(seg(t, c2.start + 0.15, c2.start + 0.8));
      revealTick(r1.el, k1, X, 168, 34);
      const k2 = eoExpo(seg(t, c2.start + 0.6, c2.start + 1.4));
      revealTick(r2.el, k2, X, 244, 54);
      const rec = eio(seg(t, c2.start + 0.6, c2.start + 1.3));
      recedeTick(r1.el, rec, X, 168, 34, rec, k1);
    },
  };
}

// ================= s10 · 慢速失血（E1 L2 红整行 + B3 滑升） =================
function buildS10(layer) {
  const c16 = CUES[15], c17 = CUES[16];
  const g = mkGroup(layer);
  const r1 = revealLine(g, { size: 36, weight: 600, fill: PALETTE.ink });
  r1.el.textContent = '每一局你都可能赢';
  const r2 = revealLine(g, { size: 52, weight: 800, fill: PALETTE.warn });
  r2.el.textContent = '每一局你都在慢速失血';
  const X = 640;
  const EXIT0 = c17.end - 0.3, EXIT1 = c17.end;
  return {
    covers(t) { return t >= c16.start && t < c17.end; },
    update(t) {
      const on = t >= c16.start && t < c17.end;
      g.style.opacity = on ? String(1 - seg(t, EXIT0, EXIT1)) : '0';
      if (!on) return;
      const k1 = eoExpo(seg(t, c16.start + 0.15, c16.start + 0.85));
      revealTick(r1.el, k1, X, 172, 36);
      const k2 = eoExpo(seg(t, c17.start + 0.12, c17.start + 0.9));
      revealTick(r2.el, k2, X, 250, 52);
      const rec = eio(seg(t, c17.start + 0.12, c17.start + 0.8));
      recedeTick(r1.el, rec, X, 172, 36, rec, k1);
    },
  };
}

// ================= s24 · 差一点（近失：大字琥珀 + 两行递进） =================
function buildS24(layer) {
  const c50 = CUES[49], c51 = CUES[50], c52 = CUES[51];
  const g = mkGroup(layer);
  const r1 = revealLine(g, { size: 64, weight: 800, fill: PALETTE.accent, ls: 6 });
  r1.el.textContent = '差一点';
  const r2 = revealLine(g, { size: 30, weight: 600, fill: PALETTE.ink });
  r2.el.textContent = '主观上比彻底没中更难受';
  const r3 = revealLine(g, { size: 36, weight: 700, fill: PALETTE.ink });
  setStyledText(r3.el, '却更让人想继续玩', ['继续玩']);
  const X = 640;
  const EXIT0 = c52.end - 0.3, EXIT1 = c52.end;
  return {
    covers(t) { return t >= c50.start && t < c52.end; },
    update(t) {
      const on = t >= c50.start && t < c52.end;
      g.style.opacity = on ? String(1 - seg(t, EXIT0, EXIT1)) : '0';
      if (!on) return;
      const k1 = eoExpo(seg(t, c50.start + 0.3, c50.start + 1.0));
      revealTick(r1.el, k1, X, 186, 64);
      const k2 = eoExpo(seg(t, c51.start + 0.12, c51.start + 0.8));
      revealTick(r2.el, k2, X, 262, 30);
      const k3 = eoExpo(seg(t, c52.start + 0.12, c52.start + 0.85));
      revealTick(r3.el, k3, X, 322, 36);
      const rec = eio(seg(t, c52.start + 0.12, c52.start + 0.8));
      recedeTick(r1.el, rec, X, 186, 64, rec, k1);
      recedeTick(r2.el, rec, X, 262, 30, rec, k2);
    },
  };
}

// ================= s31 · 自白（四句递进：99% 淡出 → 差一点就中了） =================
function buildS31(layer) {
  const c72 = CUES[71], c73 = CUES[72], c74 = CUES[73], c75 = CUES[74];
  const g = mkGroup(layer);
  const r1 = revealLine(g, { size: 28, weight: 500, fill: PALETTE.ink });
  r1.el.textContent = '我先承认一件事';
  const r2 = revealLine(g, { size: 28, weight: 500, fill: PALETTE.ink });
  r2.el.textContent = '上面这些数字，我第一遍看的时候';
  const r3 = revealLine(g, { size: 34, weight: 700, fill: PALETTE.ink });
  setStyledTextMarks(r3.el, '记住的不是百分之九十九', [{ w: '百分之九十九', fill: PALETTE.inkDim }]);
  const r4 = revealLine(g, { size: 56, weight: 800, fill: PALETTE.accent, ls: 4 });
  setStyledText(r4.el, '我记住的是“差一点就中了”', ['差一点就中了']);
  const X = 640;
  const TOTAL_END = c75.end;
  return {
    covers(t) { return t >= c72.start && t < TOTAL_END; },
    update(t) {
      const on = t >= c72.start && t < TOTAL_END;
      if (!on) { g.style.opacity = '0'; return; }
      g.style.opacity = String(1 - seg(t, TOTAL_END - 0.25, TOTAL_END));
      const k1 = eoExpo(seg(t, c72.start + 0.15, c72.start + 0.8));
      revealTick(r1.el, k1, X, 152, 28);
      const k2 = eoExpo(seg(t, c73.start + 0.12, c73.start + 0.8));
      revealTick(r2.el, k2, X, 206, 28);
      const k3 = eoExpo(seg(t, c74.start + 0.12, c74.start + 0.85));
      revealTick(r3.el, k3, X, 262, 34);
      const k4 = eoExpo(seg(t, c75.start + 0.15, c75.start + 0.95));
      revealTick(r4.el, k4, X, 336, 56);
      // 后句进场，前句让位（A1）
      const rec2 = eio(seg(t, c74.start + 0.12, c74.start + 0.7));
      recedeTick(r1.el, rec2, X, 152, 28, rec2, k1);
      recedeTick(r2.el, rec2, X, 206, 28, rec2, k2);
      const rec3 = eio(seg(t, c75.start + 0.15, c75.start + 0.75));
      recedeTick(r3.el, rec3, X, 262, 34, rec3, k3);
    },
  };
}

// ================= s33 · 收场三连问（B3 渐进 + E1 琥珀收束） =================
function buildS33(layer) {
  const c79 = CUES[78], c80 = CUES[79], c81 = CUES[80];
  const g = mkGroup(layer);
  const r1 = revealLine(g, { size: 32, weight: 500, fill: PALETTE.ink });
  r1.el.textContent = '你今天还在做的这件事';
  const r2 = revealLine(g, { size: 32, weight: 500, fill: PALETTE.ink });
  r2.el.textContent = '是为了得到它';
  const r3 = revealLine(g, { size: 50, weight: 800, fill: PALETTE.accent, ls: 4 });
  setStyledTextMarks(r3.el, '还是为了不承认已经失去的？', [
    { w: '不承认', fill: PALETTE.warn },
    { w: '失去', fill: PALETTE.warn },
  ]);
  const X = 640;
  const TOTAL_END = c81.end;
  return {
    covers(t) { return t >= c79.start && t < TOTAL_END; },
    update(t) {
      const on = t >= c79.start && t < TOTAL_END;
      if (!on) { g.style.opacity = '0'; return; }
      g.style.opacity = String(1 - seg(t, TOTAL_END - 0.2, TOTAL_END));
      const k1 = eoExpo(seg(t, c79.start + 0.15, c79.start + 0.85));
      revealTick(r1.el, k1, X, 168, 32);
      const k2 = eoExpo(seg(t, c80.start + 0.12, c80.start + 0.8));
      revealTick(r2.el, k2, X, 224, 32);
      const k3 = eoExpo(seg(t, c81.start + 0.1, c81.start + 0.9));
      revealTick(r3.el, k3, X, 296, 50);
      const rec = eio(seg(t, c81.start + 0.1, c81.start + 0.8));
      recedeTick(r1.el, rec, X, 168, 32, rec, k1);
      recedeTick(r2.el, rec, X, 224, 32, rec, k2);
    },
  };
}

// ============================================================================
// ============ 自动编排引擎（v2.10 沿用）：其余 28 幕 cue 级联上舞台 ============
// ============================================================================

// 琥珀强调词（词义驱动；oct18 词表）
const ACCENT_WORDS = [
  '赌徒谬误', '三十七分之一', '三十五比一', '百分之九十九', '百分之三十', '五十二点六',
  '九十九点四九', '四十八点六一', '二十六次黑', '上百倍', '最优数字', '结构',
  '差一点', '下一把', '拿回来', '重新开始',
];
const WARN_WORDS = ['输光', '慢速失血', '庄家通吃', '慢慢死', '失去'];   // E1b 砖红通道（每幕限一处）
const COOL_WORDS = ['可能赢', '得到', '多试一次'];                        // 青色正面/信息通道
const NUM_RE = /[0-9]/;                                                   // 数字 → pop + 琥珀

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
  else { /* 预留：徽章类 */ }
  el.setAttribute('opacity', '0');
  return { el, enter };
}

// 关键词 → 图标触发表（F4 语义映射；每 cue 最多一个图标，先命中先用）
const ICON_TRIGGERS = [
  ['输光', 'down', PALETTE.warn], ['慢速失血', 'down', PALETTE.warn],
  ['庄家通吃', 'ban', PALETTE.warn], ['没有记忆', 'ban', PALETTE.warn], ['就没了', 'ban', PALETTE.warn],
  ['停不下来', 'clock', PALETTE.inkDim], ['重新开始', 'exchange', PALETTE.cool],
  ['拿回来', 'up', PALETTE.cool], ['得到', 'up', PALETTE.cool], ['可能成', 'up', PALETTE.cool],
  ['追什么', 'eye', PALETTE.cool],
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
// noIcons: 大字插画已表达语义的幕关图标
const AUTO_CFG = {
  s01: { cues: [1] },
  s03: { cues: [3, 4] },
  s04: { cues: [5], slots: [150] },                                // 便签在左上，单槽居中顺序交接
  s05: { cues: [6, 7] },
  s06: { cues: [8], title: true, slots: [240] },                   // 轮盘 hero 顶 275，单槽在其上
  s07: { cues: [9, 10], slots: [150, 216] },
  s08: { cues: [11, 12], slots: [150, 216], noIcons: true },       // 柱状图自带数字
  s09: { cues: [13, 14, 15], slots: [140, 198, 250] },
  s11: { cues: [18, 19, 20, 21], slots: [148, 204, 260, 312] },
  s12: { cues: [22, 23], slots: [150, 216], noIcons: true },       // 99% 大数字
  s13: { cues: [24, 25], slots: [130] },                           // 气泡顶 ≈249，单槽在其上顺序交接
  s14: { cues: [26, 27], slots: [150, 216], noIcons: true },       // 52.6% 大数字
  s15: { cues: [28, 29], slots: [150, 216], noIcons: true },       // 99.49% 大数字
  s16: { cues: [30], scale: 0.85, slots: [150], noIcons: true },   // 31 由 statement 表达
  s17: { cues: [32, 33, 34], title: true, payoff: 33, slots: [236] },
  s18: { cues: [35, 36], slots: [150, 216] },
  s19: { cues: [37, 38, 39], slots: [240], payoff: 39 },           // 轮盘顶 282，单槽顺序交接
  s20: { cues: [40, 41], slots: [150, 216] },
  s21: { cues: [42, 43], title: true, slots: [240, 292] },
  s22: { cues: [44, 45, 46], slots: [140, 196, 246] },
  s23: { cues: [47, 48, 49], slots: [150, 214], noIcons: true },   // ≈ 徽章已表达
  s25: { cues: [53, 54], slots: [150, 216] },
  s26: { cues: [55, 56, 57, 58], slots: [130, 188, 246], noIcons: true },  // 30% 大数字；58 与 55 同槽顺序交接
  s27: { cues: [59, 60, 61, 62], slots: [148, 204, 260, 312] },
  s28: { cues: [63, 64, 65], slots: [148, 204, 260] },
  s29: { cues: [66, 67, 68], slots: [148, 204, 260] },
  s30: { cues: [69, 70, 71], slots: [148, 204, 260] },
  s32: { cues: [76, 77, 78], slots: [148, 204, 260] },
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
    const style = /["“”]/.test(cue.text) ? 'type' : (NUM_RE.test(cue.text) ? 'pop' : ([...cue.text].length >= 10 ? 'stagger' : 'reveal'));

    // 图标（F 类触发）
    let icon = null, iconKind = null, iconColor = null;
    if (!cfg.noIcons && !unitWarn) {
      for (const [w, kind, color] of ICON_TRIGGERS) {
        if (cue.text.includes(w)) { iconKind = kind; iconColor = color; break; }
      }
      if (iconKind) {
        icon = mkGlyph(iconKind, iconColor);
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
        // 退场时刻：后面第 2 句进场时彻底淡出；下一句同槽（含单槽）则顺序交接（先净场再进场）
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

export const TYPO_SCENES = ['s02', 's10', 's24', 's31', 's33'];

export function buildTypoLayer() {
  const layer = document.getElementById('typoLayer');
  const scenes = [
    buildS02(layer), buildS10(layer), buildS24(layer), buildS31(layer), buildS33(layer),
  ];
  for (const key of Object.keys(AUTO_CFG)) scenes.push(buildAuto(key, AUTO_CFG[key], layer));
  return {
    covers(t) { return scenes.some((s) => s.covers(t)); },
    update(t) { for (const s of scenes) s.update(t); },
  };
}
