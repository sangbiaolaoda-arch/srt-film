// 槽级动效冲突检测（baseline-audit 缺陷 5 的自动门禁）。
//
// 判据三条同时成立才算冲突 —— 缺一条都会变成「宁可错杀」：
//   ① 同一个槽（同一个 DOM 元素，GSAP 的 target 就是它）；
//   ② 时间窗重叠（入场、mx、拍级 emphasis 各自的 [at, at+dur] 有交集）；
//   ③ 属性相交（两条 tween 写同一个可动画属性，后写的会盖掉先写的）。
//
// ①②③分开看都不算错：同槽不同时用、同时用不同属性，都是合法设计；只有三条叠满
// 才会出现「某个入场没播完就被强调打断」的真实画面错误。

import { sharedProps, tweenTotal, type MotionProp } from "./props";
import { slotTweens, type MotionPlan } from "./schedule";
import type { Layout } from "../layouts/types";

export interface MotionConflict {
  slot: number;
  a: string;
  b: string;
  roles: string;
  props: MotionProp[];
  /** 重叠秒数（> 0 才有意义） */
  overlap: number;
}

export function slotConflicts(layout: Layout, plan: MotionPlan): MotionConflict[] {
  const out: MotionConflict[] = [];
  layout.slots.forEach((slot, k) => {
    const tws = slotTweens(plan, k, slot);
    for (let i = 0; i < tws.length; i++) {
      for (let j = i + 1; j < tws.length; j++) {
        const A = tws[i]!;
        const B = tws[j]!;
        const props = sharedProps(A.motion, B.motion);
        if (props.length === 0) continue;
        // 用真实写完的时刻而不是目录 dur：repeat/yoyo、逐字动效都会超出排期时长，
        // 「入场其实还在写」的这段尾巴正是冲突藏的地方。
        const endA = A.at + Math.max(A.dur, tweenTotal(A.motion, A.dur));
        const endB = B.at + Math.max(B.dur, tweenTotal(B.motion, B.dur));
        const overlap = Math.min(endA, endB) - Math.max(A.at, B.at);
        if (overlap <= 0) continue;
        out.push({ slot: k, a: A.motion, b: B.motion, roles: `${A.role}/${B.role}`, props, overlap });
      }
    }
  });
  return out;
}

export function describeConflict(c: MotionConflict): string {
  return `槽 ${c.slot} 动效冲突：${c.a}（${c.roles.split("/")[0]}）× ${c.b}（${c.roles.split("/")[1]}）`
    + ` 争抢 ${c.props.join("/")}，重叠 ${c.overlap.toFixed(2)}s`;
}
