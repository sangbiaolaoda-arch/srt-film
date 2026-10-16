// photo 槽的「挖洞」：让满幅不透明层（wash 的三层 rect、bg 的图案层）在照片
// 位置让出透明度，canvas 图像层画在 SVG 之下的照片才透得出来。
//
// 为什么必须有这一层（Phase 9 的 fx 层踩过同一个坑）：满版层一旦不透明，
// 画在它下面的任何东西都看不见。fx 那次是把特效层从 SVG 之下**移上去**解决；
// 照片不能这么干 —— 版式设计上 headline/kicker 就是要压在照片上
// （im-photo-bleed「照片是底、大字浮在其上」），所以照片必须留在下面，
// 由满版层主动让位。
//
// 只清 wash 与 bg 两层：slot 里的其它实心图形（panel/rule…）都是按槽位摆的，
// 不覆盖照片区；decor 层本来就不满幅。

import type { Layout } from "./types";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 版式里所有 photo 槽的像素矩形（舞台坐标系 1280×720）。 */
export function photoCutouts(layout: Layout): Rect[] {
  const cols = layout.cols ?? 12;
  const rows = layout.rows ?? 8;
  const out: Rect[] = [];
  for (const slot of layout.slots) {
    if (slot.k !== "photo") continue;
    const [gx, gy, gw, gh] = slot.box;
    out.push({ x: (gx / cols) * 1280, y: (gy / rows) * 720, w: (gw / cols) * 1280, h: (gh / rows) * 720 });
  }
  return out;
}

/**
 * 挖洞遮罩：全幅白（显示）＋ 每张照片一块黑（挖掉）。id 必须带拍号 ——
 * 多拍图层同处一棵 DOM，重复 id 会全部解析到第一层（同 wash-g-{beat} 的道理）。
 * 没有照片槽时返回 null，调用方据此不加 mask 属性（省掉一层无用合成）。
 */
export function CutoutMask({ id, rects }: { id: string; rects: Rect[] }): JSX.Element | null {
  if (rects.length === 0) return null;
  return (
    <mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={1280} height={720}>
      <rect x={0} y={0} width={1280} height={720} fill="#fff" />
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill="#000" />
      ))}
    </mask>
  );
}