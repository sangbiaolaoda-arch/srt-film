/* =============================================================================
 * blob-glow —— 有机光团背景（原生 JS，无框架，无依赖）
 * -----------------------------------------------------------------------------
 * 与 blob-glow.tsx 同一套数学。Remotion / React 版本见 blob-glow.tsx。
 *
 *   <div id="bg" style="position:relative;overflow:hidden"></div>
 *   <script type="module">
 *     import { mountBlobGlow, GOLD_WARM } from "./blob-glow.js";
 *     mountBlobGlow(document.getElementById("bg"), GOLD_WARM);
 *   </script>
 *
 * 关键：t 的推进速度 = 3 / 秒，等价于 Remotion 里 t = 帧号 / 10 @30fps。
 * ========================================================================== */

/** 闭合平滑：顶点当控制点、边中点当锚点 */
function smoothClosed(pts) {
  const n = pts.length;
  let d = `M ${((pts[n - 1][0] + pts[0][0]) / 2).toFixed(1)} ${((pts[n - 1][1] + pts[0][1]) / 2).toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const c = pts[i];
    const nx = pts[(i + 1) % n];
    d += ` Q ${c[0].toFixed(1)} ${c[1].toFixed(1)} ${((c[0] + nx[0]) / 2).toFixed(1)} ${((c[1] + nx[1]) / 2).toFixed(1)}`;
  }
  return d + " Z";
}

/** 团形 path。t 是时间（不是帧），amp 是形变强度（0.10~0.16 最像云） */
export function blobPath(t, cx, cy, r, seed = 0, amp = 0.12) {
  const N = 18;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const k =
      1 +
      amp * Math.sin(2 * a + t * 1.35 + seed) +
      amp * 0.6 * Math.sin(3 * a - t * 0.95 + seed * 1.7) +
      amp * 0.34 * Math.sin(5 * a + t * 0.55 + seed * 2.3);
    pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k]);
  }
  return smoothClosed(pts);
}

const NS = "http://www.w3.org/2000/svg";

/**
 * 把光团背景挂到容器上（容器需 position:relative 且 overflow:hidden）。
 * @returns {{ stop: () => void }}
 */
export function mountBlobGlow(el, { layers, blur = 52, w = 1920, h = 1080 }) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
  Object.assign(svg.style, {
    position: "absolute", inset: "0", width: "100%", height: "100%",
    filter: `blur(${blur}px)`, pointerEvents: "none",
  });

  const paths = layers.map((l) => {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("fill", l.color);
    p.setAttribute("opacity", String(l.opacity ?? 0.16));
    svg.appendChild(p);
    return { p, l };
  });
  el.appendChild(svg);

  const t0 = performance.now();
  let raf = 0;
  const tick = () => {
    const t = ((performance.now() - t0) / 1000) * 3;
    for (const { p, l } of paths) {
      p.setAttribute("d", blobPath(t * (l.speed ?? 1) + (l.phase ?? 0), l.cx, l.cy, l.r, l.seed ?? 0, l.amp ?? 0.12));
    }
    raf = requestAnimationFrame(tick);
  };
  tick();

  return {
    stop() {
      cancelAnimationFrame(raf);
      svg.remove();
    },
  };
}

/** 禀赋效应原片的配置（1920×1080 坐标系），改色即可沿用 */
export const GOLD_WARM = {
  blur: 52,
  layers: [
    { cx: 412, cy: 382, r: 336, color: "#D6A03A", seed: 31, amp: 0.12, speed: 1, phase: 0, opacity: 0.165 },
    { cx: 1512, cy: 714, r: 352, color: "#BE4F2C", seed: 17, amp: 0.115, speed: 0.8, phase: 3.4, opacity: 0.157 },
  ],
};
