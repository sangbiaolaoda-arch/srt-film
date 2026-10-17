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
import { barSeries, donut, growBars, sweepDonut, drawLine } from './charts.js';
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
      <rect x="${x - 92}" y="${y - 56}" width="184" height="112" rx="12" fill="${PALETTE.panelSoft}" stroke="${PALETTE.deep}" stroke-width="2" stroke-dasharray="8 6"/>
    </g>
    <text x="${x}" y="${y - 8}" font-family="Microsoft YaHei, Noto Sans SC, PingFang SC, sans-serif" font-size="30" font-weight="800" fill="${PALETTE.deep}" text-anchor="middle">${val}</text>
    <text x="${x}" y="${y + 26}" font-family="Microsoft YaHei, Noto Sans SC, PingFang SC, sans-serif" font-size="18" fill="${PALETTE.deep}" text-anchor="middle" opacity="0.85">${label}</text>
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
    <text x="${x}" y="${y - 46}" font-family="Microsoft YaHei, Noto Sans SC, PingFang SC, sans-serif" font-size="20" font-weight="700" fill="${PALETTE.deep}" text-anchor="middle">7 天</text>
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

  // 10 随机分三组：杯子超大特写（hero 占位法则：主焦点放大压场），三组徽章随后点名
  s10: () => `<g data-key="A">${mug(C, Y - 40, { s: 1.9 })}</g>`
    + `<g data-key="B" data-at="0.8">${groupChips(C, G + 20, ['卖家组', '买家组', '选择者'])}</g>`,

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

  // 27 单纯二选一：五五开（比例 → 环形图，自 12 点钟顺时针扫掠；决策树：part-to-whole → donut）
  s27: () => `<g data-key="A" data-at="0.3">${donut(C, Y, 118, [[0.5, PALETTE.cool], [0.5, PALETTE.warn]], { centerLabel: '五五开', sideLabels: [[C - 218, Y - 96, '换 ≈50%', PALETTE.cool], [C + 218, Y - 96, '不换 ≈50%', PALETTE.warn]] })}</g>`
    + pill(C, G + 26, '什么都没拿到 · 单纯二选一', { bg: PALETTE.panelSoft, fg: PALETTE.ink, size: 22 }),

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

  // 34 大量练习（章节）：溢价随练习次数递减（比较/进步 → 柱状系列，零基线错峰生长）
  s34: () => `<g data-key="A" data-at="0.3">${barSeries(C, Y - 8, [2.0, 1.7, 1.4, 1.2, 1.0], ['第1次', '第2次', '第3次', '第4次', '第5次'], { fmt: (v) => '×' + v, highlight: 4, maxH: 168 })}</g>`
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
