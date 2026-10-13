// 装饰层（母版）：每拍共用的画面结构元素 —— 点阵、四角裁切角标、底部进度条。
//
// 为什么单独一层：此前编辑风的纸白背景是真正的「白纸」—— 纯文字拍整页只有一行字，
// 图形拍周围也全是裸底。演讲 PPT 不素的根源不是每页都有图表，而是每页都有母版元素
// （页眉页脚、网格、角标）。这层就是那个母版：它不携带旁白信息，只提供「纸」的质感，
// 所以刻意保持静态 —— 不打 data-anim，随拍图层整体淡入，绝不动效抢戏。
//
// 导出链路：stage.tsx 把它挂在每拍的 [data-layer] 内，rasterize 序列化整层时自动带上。
// 注意：点阵用 SVG pattern，id 必须带拍号（23 拍 23 个装饰层共存于同一棵 DOM，
// 重复 id 会让所有引用解析到第一层）。

import type { Style } from "./types";
import { colorsOf } from "./render";

interface DecorProps {
  beat: number;
  /** 总拍数；缺省时进度条画满（画廊单帧预览没有总数） */
  total?: number;
  style?: Style;
}

/** 四角 L 形裁切角标：印刷加工标记，给画面一个「被装帧」的边界感。 */
function CornerMarks({ stroke }: { stroke: string }): JSX.Element {
  const m = 40; // 边距
  const a = 18; // 臂长
  const d = (x: number, y: number, dx: number, dy: number) =>
    `M${x + a * dx} ${y} L${x} ${y} L${x} ${y + a * dy}`;
  return (
    <g stroke={stroke} strokeWidth={1} fill="none">
      <path d={d(m, m, 1, 1)} />
      <path d={d(1280 - m, m, -1, 1)} />
      <path d={d(m, 720 - m, 1, -1)} />
      <path d={d(1280 - m, 720 - m, -1, -1)} />
    </g>
  );
}

export function DecorLayer({ beat, total, style }: DecorProps): JSX.Element {
  const c = colorsOf(style);
  const poster = style === "poster";
  const frac = total && total > 0 ? Math.min(1, beat / total) : 1;
  const x0 = 64;
  const x1 = 1280 - 64;
  const span = x1 - x0;
  const pid = `decor-dots-${beat}`;

  return (
    <g data-decor="">
      {!poster && (
        <>
          <defs>
            <pattern id={pid} width={48} height={48} patternUnits="userSpaceOnUse">
              <circle cx={24} cy={24} r={1.1} fill={c.dim} opacity={0.16} />
            </pattern>
          </defs>
          <rect x={0} y={0} width={1280} height={720} fill={`url(#${pid})`} />
        </>
      )}
      <CornerMarks stroke={c.hairline} />
      {!poster && (
        <g>
          {/* 右上角同心圆环：与右下角标呼应的几何锚点 */}
          <circle cx={1216} cy={56} r={15} fill="none" stroke={c.hairline} strokeWidth={1} />
          <circle cx={1216} cy={56} r={6} fill="none" stroke={c.hairline} strokeWidth={1} />
        </g>
      )}
      {/* 底部进度条：本拍在整支片子里的位置 —— 播放器进度条的书页版 */}
      <line x1={x0} y1={706} x2={x1} y2={706} stroke={c.hairline} strokeWidth={1} />
      <line x1={x0} y1={706} x2={x0 + span * frac} y2={706} stroke={c.accent} strokeWidth={2.5} />
    </g>
  );
}
