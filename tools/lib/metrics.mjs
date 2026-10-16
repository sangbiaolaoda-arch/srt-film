// 画面度量：纯函数，**Node 与浏览器页面共用同一份实现**。
//
// 为什么要共用：门禁的判据一旦在两处各写一份，就会漂移（本项目已经吃过两次
// 复制品不同步的亏）。页面侧用 `await import("/tools/lib/metrics.mjs")` 直接
// 加载这个文件（dev server 以项目根为 root，tools/ 在其下），Node 侧测试直接
// import —— 同一份实现，同一份判据。
//
// 全部只吃 RGBA 像素数组（Uint8ClampedArray），不碰 DOM，所以能在 vitest 里
// 用合成像素验证数学本身。

/** 相对亮度（Rec.601 系数，与 frame.ts 的 isLightPaper 同一套）。 */
export const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/** 区域均值网格：把画面按 cols×rows 分格，返回每格亮度均值。
 *  step 必须是 4 的倍数（RGBA 步长），默认每 4 像素取 1 个 —— 帧尺寸 1280×720
 *  时约 5.8 万样本，够算层级又不必搬全量数据。 */
export function regionLuma(data, w, h, cols, rows, step = 16) {
  const sums = new Float64Array(cols * rows);
  const counts = new Float64Array(cols * rows);
  const px = Math.max(1, Math.round(step / 4));
  for (let y = 0; y < h; y++) {
    const gy = Math.min(rows - 1, Math.floor((y / h) * rows));
    for (let x = 0; x < w; x += px) {
      const i = (y * w + x) * 4;
      const gx = Math.min(cols - 1, Math.floor((x / w) * cols));
      const k = gy * cols + gx;
      sums[k] += luma(data[i], data[i + 1], data[i + 2]);
      counts[k]++;
    }
  }
  const out = [];
  for (let k = 0; k < cols * rows; k++) out.push(counts[k] ? sums[k] / counts[k] : 0);
  return out;
}

/** 区域内亮度均值。x0,y0,x1,y1 为像素坐标，右下不含。 */
export function boxLuma(data, w, h, x0, y0, x1, y1) {
  const ax = Math.max(0, Math.min(w, Math.round(x0)));
  const ay = Math.max(0, Math.min(h, Math.round(y0)));
  const bx = Math.max(0, Math.min(w, Math.round(x1)));
  const by = Math.max(0, Math.min(h, Math.round(y1)));
  let sum = 0;
  let n = 0;
  for (let y = ay; y < by; y++) {
    for (let x = ax; x < bx; x++) {
      const i = (y * w + x) * 4;
      sum += luma(data[i], data[i + 1], data[i + 2]);
      n++;
    }
  }
  return n ? sum / n : 0;
}

/** 环形均值：盒外扩 pad 像素的环带（不含盒内）的亮度均值 —— 当作「周围底色」。
 *  坐标必须取整：版式槽位换算过来是浮点网格坐标，直接拿去索引像素数组会拿到
 *  undefined，luma(undefined) = NaN（整数坐标的 Node 用例测不出这个坑）。 */
export function ringLuma(data, w, h, box, pad) {
  const ax = Math.max(0, Math.round(box.x0 - pad));
  const ay = Math.max(0, Math.round(box.y0 - pad));
  const bx = Math.min(w, Math.round(box.x1 + pad));
  const by = Math.min(h, Math.round(box.y1 + pad));
  let sum = 0;
  let n = 0;
  for (let y = ay; y < by; y++) {
    for (let x = ax; x < bx; x++) {
      if (x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1) continue;
      const i = (y * w + x) * 4;
      sum += luma(data[i], data[i + 1], data[i + 2]);
      n++;
    }
  }
  return n ? sum / n : 0;
}

/** 分位数（内部排序，不改入参）。 */
export function percentile(values, p) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)));
  return s[i];
}

/** 平均彩度：每像素 (max−min) 的均值。用于诊断「层级是否只靠色相承载」——
 *  彩度高而亮度结构平（regionSpread 小）= 灰度下会塌成一团。 */
export function chromaMean(data, step = 16) {
  const px = Math.max(1, Math.round(step / 4));
  const total = (data.length / 4) | 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 3 < data.length; i += px * 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    sum += Math.max(r, g, b) - Math.min(r, g, b);
    n++;
  }
  return n ? sum / n : 0;
}

/** 墨量统计（抽样一次、排序一次）。
 *  inkRatio —— 与主色调相差 ≥ delta 的像素占比：画面上「真的有东西」的覆盖率。
 *              这是灰度主判据：分位数与网格均值都测不准稀疏内容（实测 1% 墨量的
 *              画面在 p02/p05 上仍是 0，网格 cell 均值又把细笔画稀释成 16）。
 *  inkSep   —— 主色调与最暗 5% 的亮度差（幅度；覆盖率够但对比太弱时用它补刀）。 */
export function inkStats(data, step = 16, delta = 28) {
  const px = Math.max(1, Math.round(step / 4));
  const vals = [];
  for (let i = 0; i + 3 < data.length; i += px * 4) vals.push(luma(data[i], data[i + 1], data[i + 2]));
  vals.sort((a, b) => a - b);
  const at = (p) => vals[Math.min(vals.length - 1, Math.max(0, Math.round((vals.length - 1) * p)))];
  const median = at(0.5);
  let n = 0;
  for (const v of vals) if (Math.abs(v - median) >= delta) n++;
  return { median, inkRatio: vals.length ? n / vals.length : 0, inkSep: Math.abs(median - at(0.05)), n: vals.length };
}

/** 边缘能量：抽样像素的平均水平梯度绝对值。文字与形状产生大量边缘、纯色块几乎没有，
 *  所以它度量的是「这一层有没有画出可辨识的结构」，且**与整幅明暗无关** ——
 *  墨量覆盖率是相对中位色的量，在暗底版式上（整块深色面板）抹掉面板反而让偏差
 *  像素变多，增量会反号（实测 v2-num-giant −1.41%）。边缘能量没有这个毛病。 */
export function edgeEnergy(data, w, h, step = 2) {
  const px = Math.max(1, Math.round(step / 4));
  let sum = 0;
  let n = 0;
  for (let y = 0; y < h; y += px) {
    for (let x = px; x < w - px; x += px) {
      const i = (y * w + x) * 4;
      const l = luma(data[i], data[i + 1], data[i + 2]);
      const j = (y * w + x + px) * 4;
      sum += Math.abs(luma(data[j], data[j + 1], data[j + 2]) - l);
      n++;
    }
  }
  return n ? sum / n : 0;
}
