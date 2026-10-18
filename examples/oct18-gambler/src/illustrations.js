// illustrations.js — 33 幕构图（每幕独立视觉母题）
//
// 编排语言同 v2（CHI 2021《Communicating with Motion》）：
//   对比 = move aside + 迟入场 + emphasize；悬疑 = unveil/count/track；
//   节奏 = 前一拍给后一拍让路，画面永远"一时刻一个主焦点"。
// 实现：data-key 编排组 + data-at="秒" 迟入场；组件来自 components.js（复用 + 赌场主题新画）。

import { PALETTE } from './palette.js';
import { barSeries } from './charts.js';
import {
  person, questionBig, cardItem, pill,
  twinPanels, choiceFork, noteCard, statement, stamp,
  personThink, coin, bubble, checkBadge, wallDiv, lockBoxes,
  roulette, diceTriple, slotMachine, brainScan, dotRow, coinStack,
  personBroke, bleedCoins, endlessLine, pressDown,
} from './components.js';

const L = 300, C = 640, R = 980, Y = 415, B = 268, G = 552; // 槽位锚点速记

// 大数字徽章（val/val2 双文本交叉淡化，seek 安全）
function bigNum(x, y, val, { r = 60, val2 = '' } = {}) {
  return `<g class="part" data-enter="scale">
    <circle cx="${x}" cy="${y}" r="${r}" fill="${PALETTE.accent}" fill-opacity="0.16"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${PALETTE.accent}" stroke-width="2.5"/>
    <text x="${x}" y="${y + 14}" font-family="Microsoft YaHei, Noto Sans SC, PingFang SC, sans-serif" font-size="${[...val].length > 4 ? 34 : 44}" font-weight="800" fill="${PALETTE.accent}" text-anchor="middle">${val}</text>
    ${val2 ? `<text x="${x}" y="${y + 14}" font-family="Microsoft YaHei, Noto Sans SC, PingFang SC, sans-serif" font-size="${[...val2].length > 4 ? 34 : 44}" font-weight="800" fill="${PALETTE.accent}" text-anchor="middle" opacity="0">${val2}</text>` : ''}
  </g>`;
}

// =====================================================================
// 33 幕构图 —— 每幕一个独立母题；相邻幕不重样
// =====================================================================
export const SCENE_SVG = {
  // 1 输光的人：人 + 翻倒钱袋 + 散落硬币（hero 占位）
  s01: () => `<g data-key="A">${personBroke(C, Y)}</g>`,

  // 2 赢还是回本：分叉（标签同主题；文字由手工块接管，本幕问句即主视觉）
  s02: () => `<g data-key="A">${choiceFork(C, Y + 30, { la: '赢', lb: '回本', foot: '' })}</g>`,

  // 3 两个词看着差不多/赌场里两种病：双面板（cue4 文字自带"两种病"，不画戳）
  s03: () => `<g data-key="A">${twinPanels(C, Y + 4, '赢', '回本')}</g>`,

  // 4 赌场外面人人都犯：侧立人（cue5 文字自带论断，不画便签）
  s04: () => `<g data-key="A">${person(760, Y + 10, { fill: PALETTE.steelDim, s: 1.0 })}</g>`,

  // 5 亏了想翻本：亏卡让位左，金币后到（cue7 自带"把本拿回来"，不画 pill）
  s05: () => `<g data-key="A">${cardItem(C, Y, '亏')}</g>`
    + `<g data-key="B" data-at="1.4">${coin(R - 20, Y - 30, { s: 1.4 })}</g>`,

  // 6 章节卡：赌场的数学——轮盘 hero（cue8 文字自带"不出老千"）
  s06: () => roulette(C, Y - 10),

  // 7 赢率 1/37 · 赔 35:1：轮盘让位左，双徽章后到右侧
  s07: () => `<g data-key="A">${roulette(L + 40, Y - 10, { s: 0.82 })}</g>`
    + `<g data-key="B" data-at="0.8">${bigNum(R - 70, Y - 60, '1/37', { r: 62 })}</g>`
    + `<g data-key="C" data-at="1.5">${bigNum(R - 70, Y + 96, '35:1', { r: 56 })}</g>`,

  // 8 每押一块亏两分七/美式亏五分二：双柱（比较 → 柱状，零基线生长）
  s08: () => `<g data-key="A" data-at="0.3">
      ${barSeries(C, Y + 8, [2.7, 5.2], ['欧式轮盘', '美式轮盘'], { fmt: (v) => '亏 ' + v + ' 分', maxH: 170, maxV: 6 })}
    </g>`,

  // 9 押大小/骰子庄家通吃/胜率 48.61：三骰同点 + 大数字（戳落左下，避开字幕带）
  s09: () => `<g data-key="A">${diceTriple(C, Y - 20, { s: 0.92 })}</g>`
    + `<g data-key="B" data-at="1.4">${bigNum(R - 40, Y + 30, '48.61%', { r: 74 })}</g>`
    + `<g data-key="T" data-at="2.2">${stamp(L + 40, Y + 70, '庄家通吃', { r: 66 })}</g>`,

  // 10 每局都可能赢/慢速失血：漏钱的人（文字手工块接管）
  s10: () => `<g data-key="A">${bleedCoins(C + 20, Y)}</g>`,

  // 11 五五开/你 50 块 vs 整个赌场：小人小筹码 vs 大墙大筹码堆（尺寸=悬殊；cue21 自带"上百倍"）
  s11: () => `<g data-key="A">${person(L + 60, Y + 10, { s: 0.8 })}</g>`
    + `<g data-key="B">${coinStack(L + 60, Y + 116, 2, { s: 0.7 })}</g>`
    + `<g data-key="C" data-at="0.9">${wallDiv(R - 80, Y - 10, { h: 230 })}</g>`
    + `<g data-key="D" data-at="1.5">${coinStack(R - 150, Y + 116, 7, { s: 0.9 })}</g>`,

  // 12 数学上/输光概率超 99%：大数字砸场（cue22/23 文字自带完整表述，不加 pill）
  s12: () => `<g data-key="A">${bigNum(C, Y - 6, '99%', { r: 84 })}</g>`,

  // 13 少玩几把？答案正好相反：思考者
  s13: () => personThink(C, Y, ['少玩几把', '就能躲开吗？']),

  // 14 一次押完 52.6%：金币 + 大数字
  s14: () => `<g data-key="A">${coin(L + 60, Y, { s: 1.5 })}</g>`
    + `<g data-key="B" data-at="0.9">${bigNum(R - 40, Y, '52.6%', { r: 78 })}</g>`,

  // 15 一百次慢慢押 99.49%：点列全暗 + 大数字（大数字上移，给 G 带 pill 留净空）
  s15: () => `<g data-key="A">${dotRow(C, Y - 60, 20, 20, { s: 0.86 })}</g>`
    + `<g data-key="B" data-at="0.9">${bigNum(C, Y + 50, '99.49%', { r: 74 })}</g>`,

  // 16 慢慢死比一把死/是结构：双柱对比 + statement（cue31 由 statement 表达）
  s16: () => `<g data-key="A" data-at="0.3">
      ${barSeries(C, Y - 4, [52.6, 99.5], ['一把死', '慢慢死'], { fmt: (v) => v + '%', maxH: 180, maxV: 110, highlight: 1 })}
    </g>`
    + statement(C, G + 26, '跟运气没关系，是结构', { size: 30, accentWord: '结构', enter: 'fade' }),

  // 17 章节卡：赌徒谬误——轮盘 + 连黑点列
  s17: () => roulette(C, Y - 20, { s: 0.86 }) + `<g data-key="B" data-at="0.8">${dotRow(C, G + 14, 10, 10, { s: 0.8, gap: 26 })}</g>`,

  // 18 蒙特卡洛 26 连黑/越押越大押红：26 点 + 筹码堆对比升高
  s18: () => `<g data-key="A">${dotRow(C, Y - 56, 26, 26, { s: 0.82, gap: 30 })}</g>`
    + `<g data-key="B" data-at="1.2">${coinStack(L + 100, Y + 108, 3, { s: 0.8 })}</g>`
    + `<g data-key="C" data-at="1.9">${coinStack(R - 100, Y + 108, 8, { s: 0.9 })}</g>`
    + `<g data-key="D" data-at="2.5">${pill(C, G + 24, '越押越大 · 都押红', { bg: PALETTE.warn, size: 21 })}</g>`,

  // 19 总该红了吧/球没有记忆：轮盘缓转（cue39 文字即揭示句，不再画 statement）
  s19: () => `<g data-key="A">${roulette(C, Y - 16, { s: 0.9 })}</g>`,

  // 20 对但不够/按在椅子上的是另一件事：手掌下压 + 人 + 便签（便签补足"停不下来"，不重复字幕）
  s20: () => `<g data-key="A">${person(L + 40, Y + 16, { s: 0.9 })}</g>`
    + `<g data-key="B" data-at="0.9">${pressDown(L + 190, Y - 130)}</g>`
    + `<g data-key="C" data-at="1.6">${noteCard(R - 40, Y - 40, '停不下来', { rot: 5, w: 300 })}</g>`,

  // 21 章节卡：大脑的把戏——扫描脑 hero（亮区）
  s21: () => brainScan(C, Y - 6, { s: 1.15, lit: true }),

  // 22 三个图标/两香蕉停中间/第三卡在上一格：老虎机核心插画（前两格同图=香蕉，第三格卡住；cue46 自带描述）
  s22: () => `<g data-key="A">${slotMachine(C, Y - 10, { s: 1.06, reels: ['▲', '▲', '?'], stuck: true })}</g>`,

  // 23 钱没赢到/大脑亮区和真赢钱一样：脑亮区 + 相等徽章（cue51 文字自带论断，不画 pill）
  s23: () => `<g data-key="A">${brainScan(L + 90, Y - 6, { s: 1.0, lit: true })}</g>`
    + `<g data-key="B" data-at="1.3">${bigNum(R - 60, Y - 20, '≈', { r: 58 })}</g>`,

  // 24 差一点更难受/更想继续玩（文字手工块接管；机器下移缩小，给三行文字让位）
  s24: () => `<g data-key="A">${slotMachine(C + 30, Y + 80, { s: 0.78, reels: ['▲', '▲', '?'], stuck: true })}</g>`,

  // 25 按钮自己按的/电脑随机停就没了：老虎机 + 左右对错 pill
  s25: () => `<g data-key="A">${slotMachine(C + 20, Y - 20, { s: 0.8, reels: ['●', '▲', '■'] })}</g>`
    + `<g data-key="B" data-at="1.2">${checkBadge(R - 60, Y - 60)}</g>`
    + `<g data-key="C" data-at="1.9">${pill(R - 60, Y + 56, '自己按 · 效应在', { bg: PALETTE.panelSoft, fg: PALETTE.ink, size: 20 })}</g>`
    + `<g data-key="D" data-at="2.4">${pill(L + 40, Y + 56, '电脑停 · 就没了', { bg: PALETTE.panelSoft, fg: PALETTE.ink, size: 20 })}</g>`,

  // 26 厂商清楚/近失比例 30%/最优数字：老虎机近失（前两格同、第三格差一点）+ 30%（cue58 自带"最优数字"）
  s26: () => `<g data-key="A">${slotMachine(L + 90, Y - 16, { s: 0.88, reels: ['▲', '▲', '■'], stuck: true })}</g>`
    + `<g data-key="B" data-at="1.1">${bigNum(R - 50, Y - 40, '30%', { r: 68 })}</g>`,

  // 27 回到开头/真正要的是拿回来：分叉回扣（标签同 s02），回本侧放大（emphasize）
  s27: () => `<g data-key="A">${choiceFork(C - 160, Y + 16, { la: '赢', lb: '回本', foot: '' })}</g>`
    + `<g data-key="B" data-at="1.2">${pill(R - 20, Y - 60, '把输掉的拿回来', { bg: PALETTE.warn, size: 22 })}</g>`
    + `<g data-key="C" data-at="2.0">${pill(R - 20, Y + 60, '赢 · 只是以为要的', { bg: PALETTE.panelSoft, fg: PALETTE.ink, size: 20 })}</g>`,

  // 28 贪 vs 回本：有终点 / 无终点两条轨道
  s28: () => `<g data-key="A">${endlessLine(C, Y)}</g>`
    + `<g data-key="B" data-at="0.6">${pill(C - 250, Y - 96, '贪', { bg: PALETTE.panelSoft, fg: PALETTE.ink, size: 22 })}</g>`
    + `<g data-key="C" data-at="1.2">${pill(C - 250, Y + 96, '回本', { bg: PALETTE.warn, size: 22 })}</g>`,

  // 29 赌场外一样/赔率写死/负期望不变：双锁箱（赔率锁死/期望为负；cue67/68 文字自带论断）
  s29: () => `<g data-key="A">${lockBoxes(C, Y + 6, { la: '赔率 写死', lb: '期望 为负' })}</g>`,

  // 30 生活里多试可能成/问题在追什么：分叉（继续/停下）+ 气泡
  s30: () => `<g data-key="A">${choiceFork(C, Y + 14, { la: '继续', lb: '停下', foot: '' })}</g>`
    + `<g data-key="B" data-at="1.4">${bubble(R + 10, Y - 120, ['你在追什么？'], { w: 250 })}</g>`,

  // 31 自白：记住的不是 99%/是差一点（文字手工块接管；插画留白 + 一枚硬币）
  s31: () => `<g data-key="A">${coin(C + 300, Y + 60, { s: 0.9 })}</g>`,

  // 32 算的不是总账/是下一把：筹码堆居中（文字自动级联）
  s32: () => `<g data-key="A">${coinStack(C, Y + 40, 3, { s: 0.9 })}</g>`,

  // 33 收场三连问：巨大问号呼吸（下移让位收场文字；文字手工块接管）
  s33: () => `<g data-key="A">${questionBig(C, Y + 40, { size: 150 })}</g>`,
};
