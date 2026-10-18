// layout.js — 槽位分配系统：解决"元素完全叠加在一起"
// 舞台 1280x720 划分为受保护区 + 内容锚点，组件只允许落在锚点上，
// 页面内 __layoutReport() 用 getBBox 逐幕实测包围盒做碰撞验收。

// ---- 受保护区（组件不得侵入）----
export const ZONES = {
  title:   { x: 240,  y: 88,  w: 800,  h: 116 },  // 标题卡（仅章节幕显示）
  caption: { x: 140,  y: 608, w: 1000, h: 84 },   // 字幕带
  edgeL:   { x: 0,    y: 0,   w: 60,   h: 720 },  // 左右安全边
  edgeR:   { x: 1220, y: 0,   w: 60,   h: 720 },
};

// ---- 内容锚点（视觉中心），横带 y∈[230,600] ----
// 左右锚半宽上限 150，中心锚半宽上限 150：L[150,450] C[490,790] R[830,1130]，间隙 40px
export const SLOTS = {
  C:      { x: 640, y: 415, maxW: 300, maxH: 370 },  // 中心主体
  L:      { x: 300, y: 415, maxW: 300, maxH: 330 },  // 左
  R:      { x: 980, y: 415, maxW: 300, maxH: 330 },  // 右
  BANNER: { x: 640, y: 268, maxW: 480, maxH: 52 },   // 结论横幅（标题卡下方）
  GROUND: { x: 640, y: 552, maxW: 220, maxH: 56 },   // 地面小件
};

// 全幅特例：只有独占幕允许（天平/图表这类宽件），此时 L/C/R 必须全空
export const WIDE = { x: 640, y: 415, maxW: 520, maxH: 320 };

// ---- 碰撞检测 ----
export function rectOf(bbox) {
  return { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height };
}
export function intersectArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return (w > 0 && h > 0) ? w * h : 0;
}
export function rectsIntersect(a, b) {
  return intersectArea(a, b) > 0;
}
