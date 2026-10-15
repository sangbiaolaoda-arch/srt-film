// Phase 7 第一刀：统一时间轴与运动关系模型（src/motion/schedule.ts）。
//
// 验收对准主计划 Phase 7 通过标准：
//   ① 同一时刻重复渲染一致 —— 上游保证是「同 shots → 同 plan」的纯函数确定性；
//   ② 每镜存在可说明的主运动或有意静止 —— 全 catalog 强制断言 + 五问非空；
//   ③ 硬切有理由、软转场不拖沓 —— transitionBias 三系分流 + 导演指定优先；
//   ④ 没有无意义的全局粒子运动掩盖静止 —— warnings 检出。
//   另验时间轴口径（拍间 0.25s 交叠）与 pace 消费。

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LAYOUTS } from "../src/layouts/catalog";
import { plan } from "../src/core/plan";
import { MOTION_BY_ID } from "../src/motion/catalog";
import {
  buildMotionSchedule, enterForSlot, staggerAt, motionPath, clampPace, OVERLAP,
} from "../src/motion/schedule";
import { STYLE_PROFILES } from "../src/styles/style-system";
import type { Layout, RenderContent } from "../src/layouts/types";
import type { Shot } from "../src/core/shot";

const root = resolve(import.meta.dirname, "..");
const SRT = readFileSync(resolve(root, "examples/01-explanatory-tech.srt"), "utf-8");

const SLIDE_POOL = ["m-cross-dissolve", "m-push-left", "m-sweep-light", "m-match-cut"];
const WIPE_POOL = ["m-wipe-diagonal", "m-wipe-panel", "m-cross-dissolve", "m-shape-match"];
const MASK_POOL = ["m-mask-circle", "m-split-open", "m-cross-dissolve", "m-shape-match"];

function contentOf(beat: number): RenderContent {
  return {
    headline: "测试标题", subhead: "", caption: "", bullets: [],
    numbers: [], numberTokens: [], bignum: undefined, unit: "", beat,
  };
}

function shotOf(layout: Layout, beat: number, dur = 3): Shot {
  return { layout, content: contentOf(beat), start: beat * dur, end: (beat + 1) * dur };
}

/** 三连拍：足以验证交叠与轮转的最小形态。 */
function threeShots(over: Partial<Layout> = {}): Shot[] {
  const layout: Layout = {
    id: "t-x", name: "测试", group: "statement", enter: ["m-fade-up"],
    ...over, slots: over.slots ?? [],
  };
  return [shotOf(layout, 0), shotOf(layout, 1), shotOf(layout, 2)];
}

describe("Phase 7 · 统一时间轴与运动关系模型", () => {
  /* ── ① 确定性 ── */
  it("同 shots → 同 plan（任意 seek 同一时刻的上游保证）", () => {
    const shots = threeShots({ emphasis: "m-pulse", camera: { scaleFrom: 1, scaleTo: 1.08 } });
    const a = buildMotionSchedule(shots);
    const b = buildMotionSchedule(shots);
    expect(a).toEqual(b);
    expect(a.plans).toHaveLength(3);
  });

  /* ── 时间轴口径 ── */
  it("时间轴口径：首拍 at=0、拍间 0.25s 交叠、at 单调不降", () => {
    const { plans } = buildMotionSchedule(threeShots());
    expect(plans[0]!.at).toBe(0);
    for (let i = 1; i < plans.length; i++) {
      expect(plans[i]!.at).toBeGreaterThanOrEqual(plans[i - 1]!.at);
      // 交叠：本拍起点落在上一拍 running - 0.25 处（running = 上拍所有 tween 最远结束点）
      const prev = plans[i - 1]!;
      expect(plans[i]!.at).toBeLessThan(prev.at + prev.dur);
    }
    expect(OVERLAP).toBe(0.25);
  });

  it("拍长下限 1.2s（SRT 区间再短也不塌成零长拍）", () => {
    const layout: Layout = { id: "t-short", name: "短", group: "statement", enter: ["m-fade-up"], slots: [] };
    const { plans } = buildMotionSchedule([{ layout, content: contentOf(0), start: 5, end: 5.1 }]);
    expect(plans[0]!.dur).toBeCloseTo(1.2, 5);
  });

  /* ── ② 主运动可说明 ── */
  it("全 catalog 每拍都有主运动或显式有意静止", () => {
    for (const l of LAYOUTS) {
      const { plans } = buildMotionSchedule([shotOf(l, 1)]);
      const p = plans[0]!;
      if (p.primary.kind === "still") expect(p.still && p.still.length > 0, l.id).toBe(true);
      else expect(p.primary.motion, l.id).toBeTruthy();
    }
  });

  it("主运动五问全部非空（任务/主体/时机/方向速度/结束状态）", () => {
    const shots = threeShots({ emphasis: "m-pulse" });
    for (const p of buildMotionSchedule(shots).plans) {
      if (p.primary.kind === "still") continue;
      const r = p.primary.rationale;
      for (const [k, v] of Object.entries(r)) {
        expect(v && v.trim().length > 0, `${k} 为空`).toBe(true);
      }
    }
  });

  it("机位运动优先成为主运动（入场从属于它）", () => {
    const { plans } = buildMotionSchedule(threeShots({ camera: { scaleFrom: 1, scaleTo: 1.1 } }));
    expect(plans[0]!.primary.kind).toBe("camera");
    expect(plans[0]!.primary.rationale.subject).toContain("机位");
  });

  it("纯平移相机也是主运动（无缩放变化的摇/移）", () => {
    const { plans } = buildMotionSchedule(threeShots({ camera: { xFrom: 0, xTo: -30 } }));
    expect(plans[0]!.primary.kind).toBe("camera");
    expect(plans[0]!.primary.rationale.path).toContain("平移");
  });

  it("假相机（无位移）不占主运动位，让给入场", () => {
    const { plans } = buildMotionSchedule(threeShots({ camera: { scaleFrom: 1, scaleTo: 1 } }));
    expect(plans[0]!.primary.kind).toBe("enter");
  });

  /* ── ③ 转场与风格 ── */
  it("transitionBias 分流：三系各进自己的池", () => {
    const mk = (style: Layout["style"]) => threeShots({ style });
    const ed = buildMotionSchedule(mk("editorial")).plans;
    const fv = buildMotionSchedule(mk("flat-vector")).plans;
    const cm = buildMotionSchedule(mk("chart-motion")).plans;
    for (const p of ed) expect(SLIDE_POOL, p.transition.motion).toContain(p.transition.motion);
    for (const p of fv) expect(WIPE_POOL, p.transition.motion).toContain(p.transition.motion);
    for (const p of cm) expect(MASK_POOL, p.transition.motion).toContain(p.transition.motion);
  });

  it("同系内转场按拍序轮换（不雷同）", () => {
    const { plans } = buildMotionSchedule(threeShots({ style: "chart-motion" }));
    expect(plans[0]!.transition.motion).toBe("m-mask-circle");
    expect(plans[1]!.transition.motion).toBe("m-split-open");
    expect(plans[2]!.transition.motion).toBe("m-cross-dissolve");
  });

  it("导演指定的 transition 优先于风格池", () => {
    const { plans } = buildMotionSchedule(threeShots({ style: "editorial", transition: "m-zoom-through" }));
    for (const p of plans) expect(p.transition.motion).toBe("m-zoom-through");
  });

  /* ── ③+ 连续性感知转场（Phase 7 第三刀）── */
  it("连续性拍转场承接继承关系：图形系形状匹配、排版系对位剪辑", () => {
    // 拍 2 带 continuity（与拍 1 共享数字）→ 触发连续性转场
    const mk = (style: Layout["style"]) => {
      const shots = threeShots({ style });
      shots[1]!.continuity = ["85%"];
      return buildMotionSchedule(shots).plans;
    };
    expect(mk("editorial")[1]!.transition.motion).toBe("m-match-cut");
    expect(mk("flat-vector")[1]!.transition.motion).toBe("m-shape-match");
    expect(mk("chart-motion")[1]!.transition.motion).toBe("m-shape-match");
    // 无连续性的拍仍走池轮转（第 3 拍 i=2 = 池第 3 项）
    expect(mk("chart-motion")[2]!.transition.motion).toBe("m-cross-dissolve");
  });

  it("首拍没有上一拍，不走连续性转场", () => {
    const shots = threeShots({ style: "flat-vector" });
    shots[0]!.continuity = ["85%"]; // 即使标了也没对象可继承
    expect(buildMotionSchedule(shots).plans[0]!.transition.motion).toBe("m-wipe-diagonal");
  });

  it("导演指定优先于连续性转场", () => {
    const shots = threeShots({ style: "flat-vector", transition: "m-push-left" });
    shots[1]!.continuity = ["85%"];
    expect(buildMotionSchedule(shots).plans[1]!.transition.motion).toBe("m-push-left");
  });

  it("形状匹配的锚点 = 上一拍母版标记角（新画面从旧标记里长出来）", () => {
    const shots = threeShots({ style: "flat-vector" });
    shots[0]!.narrative = { role: "hook", purpose: "开场", forbidden: [] }; // hook → tl
    shots[1]!.continuity = ["85%"];
    const m = buildMotionSchedule(shots).plans[1]!.transition.match;
    expect(m).toEqual({ anchor: "tl" });
  });

  it("对位剪辑继承上一拍的出场方向（水平滑出才构成承接）", () => {
    const shots = threeShots({ style: "editorial", exit: "m-slide-out-left" });
    shots[1]!.continuity = ["85%"];
    const m = buildMotionSchedule(shots).plans[1]!.transition.match;
    expect(m).toEqual({ anchor: "center", handoff: "left" });
    // 竖直/缩放类出场不带方向
    const shots2 = threeShots({ style: "editorial", exit: "m-fade-out" });
    shots2[1]!.continuity = ["85%"];
    expect(buildMotionSchedule(shots2).plans[1]!.transition.match).toEqual({ anchor: "center" });
  });

  it("池轮转到形状匹配时同样带锚点（跟随转场 id，不跟随选择路径）", () => {
    // chart-motion 池第 4 项是 m-shape-match；拍 4（i=3）无 continuity 也会轮到
    const shots = Array.from({ length: 4 }, (_, i) => shotOf(
      { id: "t-x", name: "测试", group: "statement", enter: ["m-fade-up"], style: "chart-motion", slots: [] },
      i,
    ));
    const p3 = buildMotionSchedule(shots).plans[3]!;
    expect(p3.transition.motion).toBe("m-shape-match");
    expect(p3.transition.match?.anchor).toBeTruthy();
  });

  it("motionPath：形状匹配/对位剪辑带真实参数", () => {
    expect(motionPath("m-shape-match")).toContain("0.55");
    expect(motionPath("m-match-cut")).toContain("24px");
  });

  /* ── motionPace 消费 ── */
  it("motionPace 是速度倍率：扁平风更快、图表风更稳", () => {
    // m-pulse 基准 0.6s：编辑 0.6 / 扁平 0.6÷1.18 / 图表 0.6÷0.9
    expect(clampPace(0.6, STYLE_PROFILES.editorial.motionPace)).toBeCloseTo(0.6, 5);
    expect(clampPace(0.6, STYLE_PROFILES["flat-vector"].motionPace)).toBeLessThan(0.6);
    expect(clampPace(0.6, STYLE_PROFILES["chart-motion"].motionPace)).toBeGreaterThan(0.6);
    // 版式级：同 emphasis 三种风格的时长排序
    const dur = (style: Layout["style"]) =>
      buildMotionSchedule(threeShots({ style, emphasis: "m-pulse" })).plans[0]!.emphasis!.dur;
    expect(dur("flat-vector")).toBeLessThan(dur("editorial"));
    expect(dur("editorial")).toBeLessThan(dur("chart-motion"));
  });

  /* ── 槽分配规则 ── */
  it("enterForSlot：池轮转 + 元素声明优先 + 未知回落", () => {
    const { plans } = buildMotionSchedule(threeShots({ enter: ["m-fade-up", "m-slide-left"] }));
    const p = plans[0]!;
    expect(enterForSlot(p, 0)).toBe("m-fade-up");
    expect(enterForSlot(p, 1)).toBe("m-slide-left");
    expect(enterForSlot(p, 2)).toBe("m-fade-up");
    expect(enterForSlot(p, 0, "m-zoom-in")).toBe("m-zoom-in");   // 元素自带优先
    expect(enterForSlot(p, 0, "m-nope")).toBe("m-fade-up");      // 未知 id 回落池
    const empty = buildMotionSchedule(threeShots({ enter: [] })).plans[0]!;
    expect(enterForSlot(empty, 3)).toBe("m-fade-up");
  });

  it("staggerAt：0.08×min(k,4)，第 5 个槽起封顶", () => {
    const { plans } = buildMotionSchedule(threeShots());
    expect(staggerAt(plans[0]!, 0)).toBeCloseTo(0, 5);
    expect(staggerAt(plans[0]!, 4)).toBeCloseTo(0.32, 5);
    expect(staggerAt(plans[0]!, 7)).toBeCloseTo(0.32, 5);
  });

  /* ── ④ 全局动效不掩盖静止 ── */
  it("无主运动 + 全局氛围动效 → warning（掩盖静止检出）", () => {
    const layout: Layout = { id: "t-amb", name: "氛围", group: "statement", enter: [], slots: [], ambient: "m-float" };
    const r = buildMotionSchedule([shotOf(layout, 4)]);
    expect(r.plans[0]!.primary.kind).toBe("still");
    expect(r.warnings.some((w) => w.beat === 4 && w.text.includes("掩盖静止"))).toBe(true);
  });

  it("有主运动时的氛围动效不告警", () => {
    const r = buildMotionSchedule(threeShots({ ambient: "m-float" }));
    expect(r.warnings).toEqual([]);
  });

  /* ── 构建期门禁：catalog 不许引用未知动效 ── */
  it("全 catalog 的动效 id 都登记在案（enter/emphasis/ambient/transition/exit）", () => {
    for (const l of LAYOUTS) {
      for (const id of l.enter) expect(MOTION_BY_ID.has(id), `${l.id}.enter ${id}`).toBe(true);
      if (l.emphasis) expect(MOTION_BY_ID.has(l.emphasis), `${l.id}.emphasis`).toBe(true);
      if (l.ambient) expect(MOTION_BY_ID.has(l.ambient), `${l.id}.ambient`).toBe(true);
      if (l.transition) expect(MOTION_BY_ID.has(l.transition), `${l.id}.transition`).toBe(true);
      if (l.exit) expect(MOTION_BY_ID.has(l.exit), `${l.id}.exit`).toBe(true);
    }
  });

  /* ── 方向表：数值必须来自 apply.ts 的真实实现 ── */
  it("motionPath：常用动效带真实数值，未知 id 保守兜底", () => {
    expect(motionPath("m-fade-up")).toContain("14px");
    expect(motionPath("m-zoom-in")).toContain("1.22");
    expect(motionPath("m-tick-pulse")).toContain("back.out");
    expect(motionPath("m-does-not-exist")).toContain("标准缓动");
  });

  /* ── 真实语料端到端 ── */
  it("01 语料：每拍有主运动、转场合规、时间轴有序", () => {
    const { shots, problems } = plan(SRT, "");
    expect(problems).toEqual([]);
    const { plans, warnings } = buildMotionSchedule(shots);
    expect(plans).toHaveLength(shots.length);
    for (const p of plans) {
      expect(p.primary.kind === "still" ? !!p.still : !!p.primary.motion).toBe(true);
      if (p.primary.kind !== "still") {
        const r = p.primary.rationale;
        expect(r.task.length, "叙事任务应来自 Phase 4 purpose").toBeGreaterThan(0);
      }
    }
    for (let i = 1; i < plans.length; i++) {
      expect(plans[i]!.at).toBeGreaterThanOrEqual(plans[i - 1]!.at);
    }
    expect(warnings, "真实语料不该有掩盖静止的全氛围拍").toEqual([]);
  });
});
