// illustrations.js — 40 幕构图（每幕独立视觉母题）+ 编排层 CHOREO
//
// v2.3 动效编排语言（2026-10-17 联网查证：CHI 2021《Communicating with Motion》等）：
//   对比 = move aside（旧元素让位）+ 迟入场（新人后到）+ emphasize（放大主方/缩小弱方）
//   悬疑 = unveil（遮罩揭示）/ count（数字滚动）/ track（横移揭示）
//   节奏 = 前一拍元素给后一拍让路，画面永远"一时刻一个主焦点"
//
// 实现：data-key 包一层编排组（GSAP 动编排组，入场动画动内部 .part，互不冲突）；
//       data-at="秒" 表示该元素在场景开始 N 秒后才入场（第二拍新人）。

import { PALETTE } from './palette.js';
import {
  person, questionBig, cardItem, swapArrows, pill, mug, sparkles, upPrice,
  groupChips, axisDots, choiceFork, twinPanels, scaleTilt, gainLossPair, theoryPanel,
  gearLoop, wallDiv, choco, halfSplit, lockBoxes, brokenSeal, returnLoop, cart,
  phoneBid, barsPair, ticketPair, traderFig, chartDown, oldBox, mirrorGlass,
  checkBadge, bubble, progressExp,
  statement, noteCard, stamp, personThink, hourglass, campus, coin, heart,
} from './components.js';

const L = 300, C = 640, R = 980, Y = 415, B = 268, G = 552; // 槽位锚点速记

// 单张球票（s33 编排需要拆成两个独立 part）
function ticketOne(x, y, val, label, enter) {
  return `<g class="part" data-enter="${enter}">
    <g transform="rotate(-6 ${x} ${y})">
      <rect x="${x - 92}" y="${y - 56}" width="184" height="112" rx="12" fill="${PALETTE.panelSoft}" stroke="${PALETTE.baseTop}" stroke-width="2" stroke-dasharray="8 6"/>
    </g>
    <text x="${x}" y="${y - 8}" font-family="Microsoft YaHei, Noto Sans SC, PingFang SC, sans-serif" font-size="30" font-weight="800" fill="${PALETTE.baseTop}" text-anchor="middle">${val}</text>
    <text x="${x}" y="${y + 26}" font-family="Microsoft YaHei, Noto Sans SC, PingFang SC, sans-serif" font-size="18" fill="${PALETTE.baseTop}" text-anchor="middle" opacity="0.85">${label}</text>
  </g>`;
}

// 大数字徽章（val / val2：双文本交叉淡化做数字变化，seek 安全——不用 onUpdate 回调）
function bigNum(x, y, val, { r = 60, val2 = '' } = {}) {
  // manim 高亮契约：细描边 + 低不透明度填充，从不整块实心
  return `<g class="part" data-enter="scale">
    <circle cx="${x}" cy="${y}" r="${r}" fill="${PALETTE.accent}" fill-opacity="0.16"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${PALETTE.accent}" stroke-width="2.5"/>
    <text x="${x}" y="${y + 14}" font-family="Microsoft YaHei, Noto Sans SC, PingFang SC, sans-serif" font-size="44" font-weight="800" fill="${PALETTE.accent}" text-anchor="middle">${val}</text>
    ${val2 ? `<text x="${x}" y="${y + 14}" font-family="Microsoft YaHei, Noto Sans SC, PingFang SC, sans-serif" font-size="44" font-weight="800" fill="${PALETTE.accent}" text-anchor="middle" opacity="0">${val2}</text>` : ''}
  </g>`;
}
// 七天日历
function cal7(x, y) {
  return `<g class="part" data-enter="right">
    <rect x="${x - 62}" y="${y - 70}" width="124" height="140" rx="14" fill="${PALETTE.panel}" stroke="${PALETTE.steel}" stroke-width="2"/>
    <rect x="${x - 62}" y="${y - 70}" width="124" height="34" rx="14" fill="${PALETTE.accent}"/>
    <text x="${x}" y="${y - 46}" font-family="Microsoft YaHei, Noto Sans SC, PingFang SC, sans-serif" font-size="20" font-weight="700" fill="${PALETTE.baseTop}" text-anchor="middle">7 天</text>
    <text x="${x}" y="${y + 34}" font-family="Microsoft YaHei, Noto Sans SC, PingFang SC, sans-serif" font-size="40" font-weight="800" fill="${PALETTE.ink}" text-anchor="middle">7</text>
  </g>`;
}

// =====================================================================
// 40 幕构图 —— 每幕一个独立母题；相邻幕不重样
// =====================================================================
export const SCENE_SVG = {
  // 1 开场设问：人先到中央 → 让位右侧，问号后到占左侧（编排语言第一课）
  s01: () => `<g data-key="A">${person(C, Y)}</g>`
    + `<g data-key="B" data-at="1.4">${questionBig(C - 130, 280, { size: 96 })}</g>`,

  // 2 买嫌贵卖觉亏：东西卡居中 → 让位左，钱卡后到右，双箭头压轴
  s02: () => `<g data-key="A">${cardItem(C, Y, '东西')}</g>`
    + `<g data-key="B" data-at="1.3">${cardItem(R, Y, '钱', { variant: 'money' })}</g>`
    + `<g data-key="C" data-at="2.1">${swapArrows(C, Y)}</g>`,

  // 3 那还是原来那个人吗：思考者
  s03: () => personThink(C, Y, ['还是原来', '那个人吗？']),

  // 4 先别骂他善变：斜便签 + 侧立人
  s04: () => `<g data-key="A">${noteCard(L + 40, Y - 20, '先别骂他善变', { rot: -6 })}</g>`
    + `<g data-key="B">${person(880, Y, { fill: PALETTE.steelDim, s: 0.92 })}</g>`,

  // 5 拥有给估价偷偷加价：杯子居中 → 让位，价签后到右侧上浮
  s05: () => `<g data-key="A">${mug(C, Y)}</g>`
    + `<g data-key="B" data-at="1.4">${upPrice(R - 40, Y - 30)}</g>`,

  // 6 命名·禀赋效应（章节）：杯子加冕
  s06: () => mug(C, Y) + sparkles(788, 316) + sparkles(488, 346, { r: 14 }),

  // 7 到手就变金贵：东西卡居中 → 让位左，金币后到右侧堆叠
  s07: () => `<g data-key="A">${cardItem(C, Y, '东西')}</g>`
    + `<g data-key="B" data-at="1.2">${coin(R - 20, Y - 40, { s: 1.1 })}</g>`
    + `<g data-key="C" data-at="1.7">${coin(R + 48, Y + 12, { s: 0.85 })}</g>`,

  // 8 不是命是生疏：大字陈述 + 沙漏
  s08: () => statement(C, Y - 40, '不是命，是生疏', { size: 46, accentWord: '生疏' })
    + `<g data-key="B" data-at="1.2">${hourglass(R - 20, Y + 40, { h: 150 })}</g>`,

  // 9 1990 康奈尔（章节）：校园柱廊
  s09: () => campus(C, Y + 10) + pill(C, G + 20, '1990 · 康奈尔大学', { bg: PALETTE.panelSoft, fg: PALETTE.ink }),

  // 10 随机分三组：杯子先到，三组徽章逐个点名
  s10: () => `<g data-key="A">${mug(C, Y - 20)}</g>`
    + `<g data-key="B" data-at="0.8">${groupChips(C, G + 26, ['卖家组', '买家组', '选择者'])}</g>`,

  // 11 卖家：杯子滑向卖家，问价后到
  s11: () => `<g data-key="A">${person(L, Y)}</g>`
    + `<g data-key="B">${mug(C, Y - 10, { s: 0.9 })}</g>`
    + `<g data-key="C" data-at="1.6">${pill(R, Y, '最低多少肯卖？', { bg: PALETTE.warn })}</g>`,

  // 12 买家：两手空空
  s12: () => `<g data-key="A">${person(L, Y, { fill: PALETTE.steelDim })}</g>`
    + `<g data-key="B" data-at="0.7">${noteCard(C + 60, Y - 10, '手里没有杯子', { rot: 4, w: 290 })}</g>`
    + `<g data-key="C" data-at="1.6">${pill(R + 20, Y + 130, '最高多少肯买？', { bg: PALETTE.panelSoft, fg: PALETTE.ink, size: 22 })}</g>`,

  // 13 结果 ×2：卖家买家分立 → 大数字砸场 → 主方放大弱方缩小（用户示例的标准实现）
  s13: () => `<g data-key="A">${person(L, Y, { s: 0.95 })}</g>`
    + `<g data-key="B">${person(R, Y, { fill: PALETTE.steelDim, s: 0.95 })}</g>`
    + `<g data-key="C" data-at="1.3">${bigNum(C, Y + 8, '2×')}</g>`
    + `<g data-key="D" data-at="2.2">${pill(C, G + 24, '卖家开价 ≈ 买家出价 ×2 以上', { bg: PALETTE.panelSoft, fg: PALETTE.ink, size: 22 })}</g>`,

  // 14 杯子没变，变的是在谁手里：杯子从左手交到右手
  s14: () => `<g data-key="A">${person(L, Y)}</g>`
    + `<g data-key="B">${person(R, Y, { fill: PALETTE.steelDim })}</g>`
    + `<g data-key="M">${mug(C, Y - 10, { s: 0.82 })}</g>`,

  // 15 第三组·选择者：分叉路口
  s15: () => choiceFork(C, Y + 10) + pill(C, G + 26, '第三组 · 选择者', { bg: PALETTE.panelSoft, fg: PALETTE.ink }),

  // 16 杯子还是钱：两卡对进，问号压轴
  s16: () => `<g data-key="A">${cardItem(L, Y, '杯子')}</g>`
    + `<g data-key="B" data-at="0.5">${cardItem(R, Y, '钱', { variant: 'money' })}</g>`
    + `<g data-key="C" data-at="1.4">${questionBig(C, Y - 6, { size: 88 })}</g>`,

  // 17 选择者的价贴着买家：价格轴
  s17: () => axisDots(C, Y) + pill(C, G + 26, '选择者的价，贴着买家', { bg: PALETTE.panelSoft, fg: PALETTE.ink }),

  // 18 放十分钟凭空多一倍：沙漏 + ×1 淡出 / ×2 淡入
  s18: () => `<g data-key="A">${hourglass(L + 20, Y, { h: 190 })}</g>`
    + `<g data-key="B" data-at="1.2">${bigNum(R - 30, Y + 8, '×1', { val2: '×2' })}</g>`
    + `<g data-key="C" data-at="2.0">${pill(C, G + 26, '放在手里十分钟', { bg: PALETTE.panelSoft, fg: PALETTE.ink })}</g>`,

  // 19 处境一模一样：两面板从两侧滑入对齐
  s19: () => `<g data-key="A" data-at="0.4">${twinPanels(C, Y + 6, '有杯子', '有钱')}</g>`
    + statement(C, G + 20, '最后的经济处境，一模一样', { size: 30, enter: 'fade' }),

  // 20 放手的代价：杯子想走被弹回（橡皮筋隐喻）
  s20: () => `<g data-key="A">${cardItem(C, Y, '杯子')}</g>`
    + `<g data-key="B" data-at="1.5">${statement(C + 110, Y + 140, '多出来的一倍，是放手的代价', { size: 32, fill: PALETTE.warn, accentWord: '放手' })}</g>`,

  // 21 损失厌恶（章节）：天平倾斜
  s21: () => scaleTilt(C, Y),

  // 22 得3失7：先"得到"后"失去"，失去那块更大更近
  s22: () => `<g data-key="A" data-at="0.3">${gainLossPair(C, Y)}</g>`
    + pill(C, G + 26, '同一个杯子', { bg: PALETTE.panelSoft, fg: PALETTE.ink }),

  // 23 科斯定理（章节）
  s23: () => theoryPanel(C, Y, '科斯定理', '产权能自由交易，起点不影响终点'),

  // 24 市场自动撮合：齿轮循环转动
  s24: () => `<g data-key="A">${gearLoop(C, Y + 6)}</g>`
    + pill(C, G + 26, '贵了有人买 · 亏了有人卖', { bg: PALETTE.panelSoft, fg: PALETTE.ink }),

  // 25 杯子 90% 不换巧克力：杯子居中 → 让位左，墙升起，巧克力后到右
  s25: () => `<g data-key="A">${mug(C, Y, { s: 0.9 })}</g>`
    + `<g data-key="W">${wallDiv(C, Y, { h: 210 })}</g>`
    + `<g data-key="B" data-at="1.6">${choco(R, Y)}</g>`
    + `<g data-key="T" data-at="2.2">${stamp(470, 278, '九成不换', { r: 64 })}</g>`,

  // 26 反向：巧克力居中 → 让位左，墙升起，杯子后到右
  s26: () => `<g data-key="A">${choco(C, Y)}</g>`
    + `<g data-key="W">${wallDiv(C, Y, { h: 210 })}</g>`
    + `<g data-key="B" data-at="1.4">${mug(R, Y, { s: 0.9 })}</g>`
    + `<g data-key="T" data-at="2.0">${stamp(470, 278, '一样不换', { r: 64 })}</g>`,

  // 27 单纯二选一：五五开
  s27: () => halfSplit(C, Y) + pill(C, G + 26, '什么都没拿到 · 单纯二选一', { bg: PALETTE.panelSoft, fg: PALETTE.ink, size: 22 }),

  // 28 谁开局拿什么守什么：两把锁箱
  s28: () => `<g data-key="A" data-at="0.4">${lockBoxes(C, Y + 6)}</g>`
    + pill(C, G + 30, '交易几乎没有发生', { bg: PALETTE.panelSoft, fg: PALETTE.ink }),

  // 29 预测失效：封印 + 斜杠劈下
  s29: () => `<g data-key="A">${brokenSeal(C, Y + 6)}</g>`
    + statement(C, G + 26, '体面的预测，输给了人性', { size: 30, enter: 'fade' }),

  // 30 七天无理由（章节）：购物车 + 循环箭头 + 日历
  s30: () => cart(L, Y) + `<g data-key="loop">${returnLoop(C, Y)}</g>` + cal7(R, Y)
    + pill(C, G + 10, '东西一到手，就舍不得退', { bg: PALETTE.warn, size: 21 }),

  // 31 闲鱼旧手机：手机滑中，出价标签反复浮动
  s31: () => `<g data-key="A">${person(L, Y, { fill: PALETTE.steelDim })}</g>`
    + `<g data-key="B" data-at="0.6">${phoneBid(C + 30, Y)}</g>`
    + `<g data-key="C" data-at="1.8">${pill(R + 10, Y - 40, '越看越亏', { bg: PALETTE.warn })}</g>`,

  // 32 倍数不固定：双柱生长，感情柱 pulse
  s32: () => `<g data-key="A" data-at="0.3">${barsPair(C, Y, 110, 150, '日常小物', '投入感情', { va: '2×', vb: '更高' })}</g>`
    + pill(C, G + 30, '倍数不是固定的', { bg: PALETTE.panelSoft, fg: PALETTE.ink }),

  // 33 杜克篮球票：便宜票居中 → 让位左，贵票后到右 → 贵票放大便宜票缩小（用户示例标准实现）
  s33: () => `<g data-key="A">${ticketOne(C, Y, '$100+', '卖家的最低要价')}</g>`
    + `<g data-key="B" data-at="1.3">${ticketOne(R - 60, Y + 6, '$2000+', '买家愿意付的价')}</g>`
    + `<g data-key="C" data-at="2.3">${pill(C, G + 26, '杜克大学 · 篮球票', { bg: PALETTE.panelSoft, fg: PALETTE.ink, size: 22 })}</g>`,

  // 34 大量练习（章节）：感情柱被磨平（柱体实时变矮 + 数值交叉改写）
  s34: () => `<g data-key="A">${barsPair(C, Y, 110, 150, '练习前', '反复练习后', { va: '2×', vb: '2×' })}
    <text x="740" y="429" font-family="Microsoft YaHei, Noto Sans SC, PingFang SC, sans-serif" font-size="24" font-weight="800" fill="${PALETTE.accent}" text-anchor="middle" opacity="0">≈1×</text></g>`
    + pill(C, G + 30, '大量练习 · 反复交易', { bg: PALETTE.panelSoft, fg: PALETTE.ink }),

  // 35 老手价差小：老手 + 斜便签
  s35: () => `<g data-key="A">${traderFig(C - 60, Y + 6)}</g>`
    + `<g data-key="B" data-at="1.2">${noteCard(R - 40, Y - 60, '经验真的能磨薄它', { rot: 5, w: 290 })}</g>`,

  // 36 把舍不得当成值得：舍不得被放大、值得被缩小（错误等式的视觉化）
  s36: () => `<g data-key="A" data-at="0.3">${cardItem(L, Y, '舍不得', { variant: 'money' })}</g>`
    + `<g data-key="B" data-at="1.1">${cardItem(R, Y, '值得')}</g>`
    + `<g data-key="C" data-at="2.0">${statement(C, G + 26, '把"舍不得"当成了"值得"', { size: 30, enter: 'fade' })}</g>`,

  // 37 手按不到卖出键：走势图描线
  s37: () => `<g data-key="A">${chartDown(C, Y)}</g>`
    + pill(C, G + 30, '手按不到卖出键', { bg: PALETTE.panelSoft, fg: PALETTE.ink }),

  // 38 拥有权冒充价值：旧箱 + 心浮起 + 自白气泡
  s38: () => `<g data-key="A">${oldBox(L + 30, Y + 20)}</g>`
    + `<g data-key="H" data-at="1.3">${heart(L + 30, Y - 90, { s: 0.9 })}</g>`
    + `<g data-key="B" data-at="1.9">${bubble(R, Y, ['"毕竟是', '自己的"'], { w: 250 })}</g>`
    + `<g data-key="C" data-at="2.6">${statement(C, G + 26, '拥有权在冒充价值', { size: 30, fill: PALETTE.warn, enter: 'fade' })}</g>`,

  // 39 自检（章节）：放大镜 + 假设气泡 + 对勾压轴
  s39: () => `<g data-key="A">${bubble(L, Y, ['假设你现在', '根本没有拥有它'], { w: 320 })}</g>`
    + `<g data-key="B">${mirrorGlass(C + 90, Y - 10)}</g>`
    + `<g data-key="C" data-at="1.6">${checkBadge(R - 30, Y)}</g>`,

  // 40 最后的问句：巨大问号呼吸
  s40: () => `<g data-key="A">${questionBig(C, Y + 10, { size: 150 })}</g>`
    + `<g data-key="B" data-at="0.8">${pill(C, G + 30, '问自己一句', { bg: PALETTE.accent, size: 26 })}</g>`,
};

// =====================================================================
// 编排层 CHOREO —— 入场完成后的"幕内叙事运动"
// 每个函数：(tl, layer, T, dur)；T(off) 返回"按幕时长缩放后的绝对时刻"，
// 短幕（<6.3s）自动压缩拍点，保证动作在切幕前完成。
// 坑备忘：GSAP 对 SVG transformOrigin 像素值相对元素自身 bbox 左上角，
//         一律用 '50% 50%' 等百分比。
// =====================================================================
const E = 'power2.inOut';
function mv(tl, el, at, vars, d = 0.9) {
  if (el) tl.to(el, Object.assign({ duration: d, ease: E, transformOrigin: '50% 50%' }, vars), at);
}

// 幕时长 → 拍点缩放系数（6.3s 为标称幕长；短幕最低压到 0.55）
export function choreoScale(dur) {
  return Math.max(0.55, Math.min(1, dur / 6.3));
}
// 统一入口：构造 T(off) 后调用具体编排
export function runChoreo(key, tl, layer, t0, dur) {
  const fn = CHOREO[key];
  if (!fn) return;
  const K = choreoScale(dur);
  const T = (off) => t0 + off * K;
  fn(tl, layer, T, dur, t0);
}

export const CHOREO = {
  // s01 人让位，问号登场
  s01(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.6), { x: 150 });
    mv(tl, layer.querySelector('[data-key="B"]'), T(2.4), { scale: 1.12, yoyo: true, repeat: 1, duration: 0.55 }, 0.55);
  },
  // s02 东西让位左，钱后到右，箭头压轴
  s02(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.5), { x: -290 });
  },
  // s05 杯子让位左，价签后到
  s05(tl, layer, T, dur, t0) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.6), { x: -250, scale: 0.94 });
    mv(tl, layer.querySelector('[data-key="B"] text'), T(3.2), { y: -10, yoyo: true, repeat: 3, duration: 0.4 }, 0.4);
  },
  // s07 东西让位，金币依次落下
  s07(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.4), { x: -260 });
    mv(tl, layer.querySelector('[data-key="B"]'), T(2.1), { y: -26 }, 0.5);
    mv(tl, layer.querySelector('[data-key="C"]'), T(2.6), { y: -20 }, 0.5);
  },
  // s10 杯子揭幕式放大
  s10(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.8), { scale: 1.14, yoyo: true, repeat: 1, duration: 0.7 }, 0.7);
  },
  // s11 杯子滑向卖家手里
  s11(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="B"]'), T(1.2), { x: -180, y: 8, scale: 0.96 });
  },
  // s13 大数字砸场 + 卖家放大 / 买家缩小（A 比 B 好 → A 主导画面）
  s13(tl, layer, T) {
    const c = layer.querySelector('[data-key="C"]');
    mv(tl, c, T(1.5), { scale: 1.18, duration: 0.45 }, 0.45);
    mv(tl, c, T(2.05), { scale: 1, duration: 0.6, ease: 'back.out(2)' }, 0.6);
    mv(tl, layer.querySelector('[data-key="A"]'), T(3.4), { scale: 1.12, x: 20 }, 0.8);
    mv(tl, layer.querySelector('[data-key="B"]'), T(3.4), { scale: 0.9, x: -20 }, 0.8);
  },
  // s14 杯子从左手交到右手
  s14(tl, layer, T, dur, t0) {
    const m = layer.querySelector('[data-key="M"]');
    mv(tl, m, T(1.6), { x: 190, y: 6, rotation: 8, duration: 1.4 }, 1.4);
    mv(tl, m, Math.min(T(4.4), t0 + dur - 0.8), { rotation: 0, y: 0 }, 0.6);
  },
  // s16 两卡对进让位，问号放大
  s16(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="C"]'), T(2.6), { scale: 1.15, yoyo: true, repeat: 1, duration: 0.6 }, 0.6);
  },
  // s18 沙漏翻转感 + ×1 → ×2 交叉淡化
  s18(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.1), { scaleY: -1, duration: 0.55 }, 0.55);
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.7), { scaleY: 1, duration: 0.55 }, 0.55);
    const texts = layer.querySelectorAll('[data-key="B"] text');
    if (texts.length >= 2) {
      tl.to(texts[0], { opacity: 0, duration: 0.35, ease: 'power1.inOut' }, T(2.6));
      tl.to(texts[1], { opacity: 1, duration: 0.35, ease: 'power1.inOut' }, T(2.6));
    }
  },
  // s19 两面板滑入对齐
  s19(tl, layer, T) {
    const p = layer.querySelector('[data-key="A"]');
    if (!p) return;
    // twinPanels 是一个 part：整体先左后右再合拢（用轻微 x 摆动表达"对齐"）
    mv(tl, p, T(1.2), { x: -18, duration: 0.5 }, 0.5);
    mv(tl, p, T(1.75), { x: 18, duration: 0.5 }, 0.5);
    mv(tl, p, T(2.3), { x: 0, duration: 0.5 }, 0.5);
  },
  // s20 杯子想走被弹回（放手代价的橡皮筋）
  s20(tl, layer, T) {
    const a = layer.querySelector('[data-key="A"]');
    mv(tl, a, T(1.0), { x: 80, duration: 0.55, ease: 'power2.out' }, 0.55);
    mv(tl, a, T(1.55), { x: 0, duration: 1.0, ease: 'elastic.out(1, 0.4)' }, 1.0);
  },
  // s24 齿轮慢转
  s24(tl, layer, T, dur, t0) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(0.8), { rotation: 360, repeat: 2, duration: (dur - 2) / 3, ease: 'none' });
  },
  // s25 杯子居中 → 让位左 → 墙升起（unveil）→ 巧克力后到
  s25(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(0.9), { x: -340 });
    const wallG = layer.querySelector('[data-key="W"]');
    const inner = wallG ? wallG.querySelector('g') : null;
    if (inner) tl.from(inner, { scaleY: 0.05, transformOrigin: '50% 100%', duration: 0.9, ease: 'power3.out' }, T(1.2));
  },
  // s26 巧克力居中 → 让位左 → 墙升起 → 杯子后到
  s26(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(0.9), { x: -320 });
    const wallG = layer.querySelector('[data-key="W"]');
    const inner = wallG ? wallG.querySelector('g') : null;
    if (inner) tl.from(inner, { scaleY: 0.05, transformOrigin: '50% 100%', duration: 0.9, ease: 'power3.out' }, T(1.0));
  },
  // s29 斜杠劈下
  s29(tl, layer, T) {
    const line = layer.querySelector('[data-key="A"] line');
    if (line) tl.from(line, { rotation: 46, transformOrigin: '50% 50%', duration: 0.4, ease: 'power4.in' }, T(1.4));
  },
  // s31 出价标签反复浮动（市场骚扰感）
  s31(tl, layer, T) {
    const b = layer.querySelector('[data-key="B"]');
    if (b) mv(tl, b, T(1.4), { y: -8, yoyo: true, repeat: 3, duration: 0.7 }, 0.7);
  },
  // s32 双柱生长 + 感情柱 pulse
  s32(tl, layer, T) {
    const g = layer.querySelector('[data-key="A"]');
    if (!g) return;
    const rects = g.querySelectorAll('rect');
    const texts = g.querySelectorAll('text');
    [rects[0], rects[1]].forEach((r, i) => {
      if (!r) return;
      const h0 = +r.getAttribute('height'), y0 = +r.getAttribute('y');
      tl.from(r, { attr: { height: 6, y: y0 + h0 - 6 }, duration: 1.1, ease: 'power2.out' }, T(1.0) + i * 0.5);
    });
    if (texts[0]) mv(tl, texts[0], T(2.6), { scale: 1.25, yoyo: true, repeat: 1, duration: 0.4, transformOrigin: '50% 80%' }, 0.4);
  },
  // s33 便宜票让位左，贵票后到右并放大压过便宜票（用户示例 verbatim）
  s33(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.5), { x: -320, scale: 0.88 }, 1.0);
    mv(tl, layer.querySelector('[data-key="B"]'), T(3.2), { scale: 1.14 }, 0.8);
  },
  // s34 感情柱被磨平：柱体实时变矮 + 数值 2× → ≈1× 交叉改写（seek 安全）
  s34(tl, layer, T) {
    const g = layer.querySelector('[data-key="A"]');
    if (!g) return;
    const rects = g.querySelectorAll('rect');
    const texts = g.querySelectorAll('text');
    const r = rects[1];
    if (r) {
      const h0 = +r.getAttribute('height'), y0 = +r.getAttribute('y');
      tl.to(r, { attr: { height: 44, y: y0 + h0 - 44 }, duration: 1.8, ease: 'power2.inOut' }, T(1.6));
      // 数值标签跟随柱顶
      const val = texts[2];
      if (val) tl.to(val, { attr: { y: y0 + h0 - 44 - 12 }, duration: 1.8, ease: 'power2.inOut' }, T(1.6));
      // 改写：原数值淡出、≈1× 淡入（最后一个 text 是叠加的 ≈1×）
      const v2 = texts[texts.length - 1];
      if (val && v2 && v2 !== val) {
        tl.to(val, { opacity: 0, duration: 0.3, ease: 'power1.inOut' }, T(2.6));
        tl.to(v2, { opacity: 1, duration: 0.3, ease: 'power1.inOut' }, T(2.65));
      }
    }
  },
  // s36 舍不得放大、值得缩小（错误等式）
  s36(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(2.4), { scale: 1.16 }, 0.8);
    mv(tl, layer.querySelector('[data-key="B"]'), T(2.4), { scale: 0.84 }, 0.8);
  },
  // s38 心从箱子里浮起，反复摇曳
  s38(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="H"]'), T(1.5), { y: -22, yoyo: true, repeat: 3, duration: 0.8 }, 0.8);
  },
  // s40 巨问号呼吸
  s40(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.2), { scale: 1.07, yoyo: true, repeat: 3, duration: 1.1 }, 1.1);
  },
};

// 场景内二次运动（按 anim 键注册，storyboard 引用）
export const ILLU_ANIM = {
  tilt(tl, el, t) {
    const beam = el.querySelector('#lossBeam');
    if (beam) tl.to(beam, { rotation: 9, transformOrigin: '50% 8px', duration: 1.2, ease: 'power2.inOut' }, t + 0.4);
  },
  loop(tl, el, t) {
    const loop = el.querySelector('#refundLoop');
    if (loop) tl.to(loop, { rotation: 360, transformOrigin: '50% 50%', repeat: -1, duration: 6, ease: 'none' }, t);
  },
  draw(tl, el, t) {
    const line = el.querySelector('#refLine');
    if (line) {
      const len = line.getTotalLength ? line.getTotalLength() : 600;
      tl.fromTo(line, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 2.4, ease: 'power1.inOut' }, t + 0.3);
    }
  },
  fill(tl, el, t) {
    const f = el.querySelector('#expFill');
    if (f) tl.to(f, { attr: { width: 200 }, duration: 2.0, ease: 'power2.out' }, t + 0.5);
  },
};
