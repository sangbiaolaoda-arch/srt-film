// 组级运动的 GSAP 编译（方案 §3.1 链路里的「现有 GSAP 时间轴编译」一段）。
//
// 这里**只翻译**：MovePlan 说什么，就下什么 tween。任何编排判断都不在这里发生 ——
// 与 schedule.ts 对 stage.tsx 的分工一致（决策在纯函数里，舞台只执行）。
//
// 两个必须做对、否则 IR 与画面必然漂移的细节：
//   ① 每条 move 都要有一条「起点前置」：在最开始把元素按 from 置位（opacity 0 / 位移起点），
//      否则入场开始前它会以终态露在画面上（IR 也按同样口径求值，见 elements.ts 的 foldTransform）；
//   ② 缩放原点用 svgOrigin（画面坐标系的固定锚点），不让浏览器隐式选中心 ——
//      方案 §3.3 第 6 条。

import type { ElementGraph, MovePlan } from "./elements";
import { easeOf } from "./elements";

/** 只有这些属性在本轮允许被 move 驱动（与 elements.ts 的 foldTransform 同表）。 */
const PROPS = ["x", "y", "scale", "scaleX", "scaleY", "opacity"] as const;

export interface ApplyElementResult {
  applied: number;
  /** 图里有、DOM 里找不到的组（渲染层没实现分组时会落这里 —— 必须报出来，不能静默） */
  missingTargets: string[];
}

export interface ApplyElementArgs {
  tl: gsap.core.Timeline;
  /** 本拍图层（含 <g data-group> 的容器） */
  scope: Element;
  graph: ElementGraph;
  moves: MovePlan[];
}

function varsOf(src: Record<string, number | string>): gsap.TweenVars {
  const out: gsap.TweenVars = {};
  for (const k of PROPS) {
    const v = src[k];
    if (v === undefined) continue;
    out[k] = Number(v);
  }
  return out;
}

export function applyElementMoves({ tl, scope, graph, moves }: ApplyElementArgs): ApplyElementResult {
  const nodeOf = new Map(graph.nodes.map((n) => [n.id, n]));
  const missingTargets: string[] = [];
  const els = new Map<string, Element>();

  for (const id of new Set(moves.map((m) => m.targetId))) {
    const el = scope.querySelector(`[data-group="${id}"]`);
    if (!el) {
      missingTargets.push(id);
      continue;
    }
    els.set(id, el);
  }

  const sorted = [...moves].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  const initialized = new Set<string>();
  let applied = 0;

  for (const m of sorted) {
    const el = els.get(m.targetId);
    const node = nodeOf.get(m.targetId);
    if (!el || !node) continue;
    const ease = easeOf(m.ease);
    if (!ease) throw new Error(`move ${m.id}：缓动「${m.ease}」不在 IR 白名单，编译中止（计划与画面必然不一致）`);

    const fromVars = varsOf(m.from);
    const toVars = varsOf(m.to);

    // ① 起点前置：整条时间轴的 0 时刻就按 from 置位（含 opacity 0），入场前不许露脸
    if (!initialized.has(m.targetId)) {
      initialized.add(m.targetId);
      tl.set(el, { ...fromVars }, 0);
    }

    // ② 缩放绕组锚点
    tl.fromTo(
      el,
      fromVars,
      { ...toVars, duration: m.duration, ease: m.ease, svgOrigin: `${node.anchor.x} ${node.anchor.y}`, immediateRender: false },
      m.start,
    );
    applied++;
  }

  return { applied, missingTargets };
}
