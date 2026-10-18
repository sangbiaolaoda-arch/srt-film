// 因果切片测试（方案 §4.2 层 A / §5.3 因果 A→B / Phase 3）。
// 反向测试的判据：**每个夹具都必须有违反**，且违反要能定位到对象与时间点。
// 抽取层还要证明「只有时间先后、没有因果标记」不画成因果（§11 case 5）。

import { describe, it, expect } from "vitest";
import { extractEvents, extractCausalEvent } from "../src/semantics/events";
import { planCausal } from "../src/semantics/causal-slice";
import { buildCausalSlice, causalMoves, causalRelations, NODE } from "../src/semantics/causal-slice";
import { auditMotionGeometry, type ElementGraph, type MovePlan, type RelationConstraint } from "../src/motion/elements";

const AT = 1.0;
const DUR = 4.0;

function build(text: string) {
  const evs = extractEvents(text, 7);
  const ev = evs.find((e) => e.type === "cause_effect");
  const plan = ev ? planCausal(ev) : null;
  if (!ev || !plan) throw new Error(`语料未命中因果：${text}`);
  const slice = buildCausalSlice(plan, "shot-audit", { hasCaption: true });
  return { ev, slice, graph: slice.graph, moves: causalMoves(slice, AT, DUR), relations: causalRelations(slice, AT, DUR, "editorial") };
}

function audit(g: { graph: ElementGraph; moves: MovePlan[]; relations: RelationConstraint[] }) {
  return auditMotionGeometry(g.graph, g.moves, g.relations, { from: AT, to: AT + DUR, fps: 30 });
}

describe("因果抽取", () => {
  it("因为…所以 → 抽出因果事件，实体为 cause/effect", () => {
    const evs = extractEvents("因为温度上升，所以冰川融化。", 3);
    const ev = evs.find((e) => e.type === "cause_effect");
    expect(ev).toBeTruthy();
    expect(ev!.entities.map((e) => e.id).sort()).toEqual(["ent-cause", "ent-effect"]);
    expect(ev!.entities.find((e) => e.id === "ent-cause")!.name).toBe("温度上升");
    expect(ev!.entities.find((e) => e.id === "ent-effect")!.name).toBe("冰川融化");
  });

  it("A 导致 B → 抽出因果", () => {
    const ev = extractCausalEvent("温度升高导致冰川融化。", 4);
    expect(ev?.type).toBe("cause_effect");
    expect(ev?.entities.find((e) => e.id === "ent-effect")!.name).toBe("冰川融化");
  });

  it("§11 case 5：只有时间先后、没有因果标记 → 不画成因果", () => {
    const evs = extractEvents("温度上升后，冰川也融化了。", 5);
    expect(evs.find((e) => e.type === "cause_effect")).toBeFalsy();
    expect(evs[0]!.type).toBe("statement");
    expect(evs[0]!.degraded).toContain("因果");
  });

  it("先 A 后 B → 不画成因果", () => {
    const evs = extractEvents("先有阴天，后有降雨。", 6);
    expect(evs.find((e) => e.type === "cause_effect")).toBeFalsy();
  });
});

describe("因果切片（合法构图）", () => {
  it("原因→连线→结果的合法构图：落位后无违反，且含因果顺序断言", () => {
    const g = build("因为温度上升，所以冰川融化。");
    const rep = audit(g);
    expect(rep.planErrors).toEqual([]);
    expect(rep.violations.filter((v) => v.severity === "error")).toEqual([]);
    expect(g.slice.plan.assertions).toContain("causal-order");
    expect(g.slice.plan.assertions).toContain("cause-left");
  });

  it("同一实体的文字与图形同组（fig-cause ↔ label-cause 共享语义实体与父组）", () => {
    const g = build("因为温度上升，所以冰川融化。");
    const byId = new Map(g.graph.nodes.map((n) => [n.id, n]));
    for (const [fig, label] of [
      [NODE.figCause, NODE.labelCause],
      [NODE.figEffect, NODE.labelEffect],
    ] as const) {
      expect(byId.get(fig)!.semanticEntityId).toBe(byId.get(label)!.semanticEntityId);
      expect(byId.get(label)!.parentId).toBe(NODE.grpCause === byId.get(fig)!.parentId ? NODE.grpCause : NODE.grpEffect);
    }
  });

  it("原因在左、结果在右（方向明确，不是中性并列）", () => {
    const g = build("因为温度上升，所以冰川融化。");
    const byId = new Map(g.graph.nodes.map((n) => [n.id, n]));
    expect(byId.get(NODE.grpCause)!.bounds.x).toBeLessThan(byId.get(NODE.grpEffect)!.bounds.x);
  });
});

describe("反向夹具：每个都必须失败并能定位", () => {
  it("① 结果早于连线完成就显现：revealAfter 报错并给出时间点", () => {
    const g = build("因为温度上升，所以冰川融化。");
    // 把结果入场提前到连线完成之前（连线 0.55–0.95，这里让它 0.3 就开始）
    for (const m of g.moves) if (m.id === "mv-effect-enter") { m.start = AT + 0.3; m.duration = 0.5; }
    const rep = audit(g);
    const v = rep.violations.find((x) => x.relationId === "rel-causal-order");
    expect(v).toBeTruthy();
    expect(v!.type).toBe("revealAfter");
    expect(v!.detail).toContain("因果连接完成前");
    expect(v!.at).toBeLessThan(AT + 0.95);
  });

  it("② 原因与结果意外重叠：净空报错（并给出重叠深度）", () => {
    const g = build("因为温度上升，所以冰川融化。");
    const target = g.graph.nodes.find((n) => n.id === NODE.grpCause)!.bounds;
    const shift = target.x - g.graph.nodes.find((n) => n.id === NODE.grpEffect)!.bounds.x;
    for (const n of g.graph.nodes) if (n.id === NODE.grpEffect || n.parentId === NODE.grpEffect) n.bounds = { ...n.bounds, x: n.bounds.x + shift };
    const rep = audit(g);
    const v = rep.violations.find((x) => x.relationId === "rel-clearance-groups" && x.severity === "error");
    expect(v).toBeTruthy();
    expect(v!.detail).toContain("已重叠");
    expect(rep.metrics.minClearance).toBeLessThan(0);
  });

  it("③ 因果方向反转：结果画到左边 → rel-cause-left 报错", () => {
    const g = build("因为温度上升，所以冰川融化。");
    for (const n of g.graph.nodes) if (n.parentId === NODE.grpEffect) n.bounds = { ...n.bounds, x: 128 };
    for (const n of g.graph.nodes) if (n.id === NODE.grpEffect) n.bounds = { ...n.bounds, x: 128 };
    const rep = audit(g);
    const v = rep.violations.find((x) => x.relationId === "rel-cause-left");
    expect(v).toBeTruthy();
    expect(v!.type).toBe("leftOf");
  });

  it("④ 保持区间内加入未声明漂移：holds 报错", () => {
    const g = build("因为温度上升，所以冰川融化。");
    g.moves.push({
      id: "mv-undeclared-drift",
      targetId: NODE.grpCause,
      channel: "transform",
      start: 3.2,
      duration: 0.6,
      from: { y: 0 },
      to: { y: 6 },
      ease: "sine.inOut",
      reason: "（未声明）",
      eventId: "ev-7",
    });
    const rep = audit(g);
    const v = rep.violations.find((x) => x.relationId === "rel-hold-grp-cause");
    expect(v).toBeTruthy();
    expect(v!.detail).toContain("漂移");
  });
});
