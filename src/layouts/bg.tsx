// 满版图形背景层：画法套装 A 组移植（A01 圆点渐隐 / A03 半调 / A05 山形 / A18 放射 / A02 水波）。
// 确定性：无随机、无 filter，同一版式+beat 每次渲染像素一致 —— 导出契约硬要求。
// 位置：底色之上、decor 与槽位之下；用 hairline/dim 低透明度着色，只做构图主体不抢正文。

import { CutoutMask, type Rect } from "./cutout";
import type { BgKind } from "./types";

interface BgProps {
  kind: BgKind;
  /** 伪随机种子源：用 beat 让相邻拍的背景相位不同（仍确定性） */
  seed: number;
  colorDim: string;
  colorHairline: string;
  accent: string;
  /** 要让出透明度的矩形（photo 槽）。bg 的五种画法全是满幅图案，
   *  不挖洞会盖住画在 SVG 之下的照片（同 wash 的道理）。 */
  cutouts?: Rect[];
}

/** 线性同余伪随机：确定性且分布够用于装饰相位。 */
function lcg(seed: number): () => number {
  let s = (seed * 9301 + 49297) % 233280;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function BgLayer({ kind, seed, colorDim, colorHairline, accent, cutouts = [] }: BgProps): JSX.Element {
  // 有 photo 槽时把整层套进挖洞遮罩：图案在照片位置让出，照片透上来。
  if (cutouts.length > 0) {
    const mid = `bg-cut-${seed}`;
    return (
      <>
        <defs>
          <CutoutMask id={mid} rects={cutouts} />
        </defs>
        <g mask={`url(#${mid})`} data-bg-masked="">
          <BgLayer kind={kind} seed={seed} colorDim={colorDim} colorHairline={colorHairline} accent={accent} />
        </g>
      </>
    );
  }
  switch (kind) {
    // A01 圆点网格渐隐：从右上密到左下疏，印刷网点退晕
    case "dots-fade": {
      const dots: JSX.Element[] = [];
      const step = 44;
      for (let gy = 0; gy < 720 / step + 1; gy++) {
        for (let gx = 0; gx < 1280 / step + 1; gx++) {
          const x = gx * step;
          const y = gy * step;
          const t = 1 - (x / 1280) * 0.55 - (y / 720) * 0.45; // 右上 1 → 左下 0
          const r = 1.2 + t * 3.4;
          dots.push(<circle key={`${gx}-${gy}`} cx={x} cy={y} r={r} fill={colorDim} opacity={0.1 + t * 0.22} />);
        }
      }
      return <g data-bg="dots-fade">{dots}</g>;
    }
    // A03 半调大渐变：行距渐变 + 半径渐变，做出「由暗到亮」的印刷网点海
    case "halftone": {
      const rnd = lcg(seed + 7);
      const dots: JSX.Element[] = [];
      const rows = 16;
      for (let i = 0; i < rows; i++) {
        const y = (i + 0.5) * (720 / rows);
        const t = 1 - i / (rows - 1); // 顶部 1 → 底部 0
        const step = 26 + (1 - t) * 26;
        for (let x = step / 2; x < 1280; x += step) {
          const wob = rnd() * 0.35 + 0.82;
          dots.push(<circle key={`${i}-${x}`} cx={x} cy={y} r={(1.4 + t * 5) * wob} fill={colorDim} opacity={0.16 + t * 0.3} />);
        }
      }
      return <g data-bg="halftone">{dots}</g>;
    }
    // A05 山形层叠：4 层山脊剪影，最远层最淡
    case "contour": {
      const rnd = lcg(seed + 13);
      const layers: JSX.Element[] = [];
      for (let l = 0; l < 4; l++) {
        const base = 430 + l * 68;
        const amp = 120 - l * 22;
        const pts: string[] = [`0,720`, `0,${base}`];
        const seg = 8;
        for (let i = 0; i <= seg; i++) {
          const x = (i / seg) * 1280;
          const y = base - Math.abs(Math.sin(i * (1.1 + l * 0.35) + rnd() * 2)) * amp * (i === 0 || i === seg ? 0.35 : 1);
          pts.push(`${x},${y.toFixed(1)}`);
        }
        pts.push(`1280,720`);
        layers.push(<polygon key={l} points={pts.join(" ")} fill={colorDim} opacity={0.12 + l * 0.06} />);
      }
      return <g data-bg="contour">{layers}</g>;
    }
    // A18 放射花瓣：中心放射细线，花心留空，右偏构图
    case "rays": {
      const cx = 1280 * 0.72;
      const cy = 720 * 0.46;
      const n = 36;
      const lines: JSX.Element[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r0 = 66 + (i % 2) * 22;
        const r1 = i % 4 === 0 ? 330 : 250;
        lines.push(
          <line
            key={i}
            x1={cx + Math.cos(a) * r0}
            y1={cy + Math.sin(a) * r0}
            x2={cx + Math.cos(a) * r1}
            y2={cy + Math.sin(a) * r1}
            stroke={accent}
            strokeWidth={1}
            opacity={0.3}
          />,
        );
      }
      return (
        <g data-bg="rays">
          {lines}
          <circle cx={cx} cy={cy} r={5} fill={accent} opacity={0.75} />
        </g>
      );
    }
    // A02 水波细线：下三分之一水平细波纹，文字压在上面
    case "waves": {
      const lines: JSX.Element[] = [];
      const rows = 12;
      for (let i = 0; i < rows; i++) {
        const y = 470 + i * 21;
        const amp = 5 + i * 0.7;
        const d = `M0 ${y} Q 80 ${y - amp} 160 ${y} T 320 ${y} T 480 ${y} T 640 ${y} T 800 ${y} T 960 ${y} T 1120 ${y} T 1280 ${y}`;
        lines.push(<path key={i} d={d} fill="none" stroke={colorHairline} strokeWidth={1.6} opacity={0.9} />);
      }
      return <g data-bg="waves">{lines}</g>;
    }
    default:
      return <g data-bg="none" />;
  }
}
