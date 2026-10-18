// 转折切片测试（方案 §13 转折/让步 / Phase 3）。
// 反向测试的判据：**每个夹具都必须有违反**，且违反要能定位到对象与时间点。
// 抽取层还要证明「不但…而且…」这类递进不画成转折。

import { describe, it, expect } from "vitest";
import { extractEvents, extractContrastEvent } from "../src/semantics/events";
import { planContrast } from "../src/semantics/contrast-slice";
import { buildContrastSlice, contrastMoves, contrastRelations, NODE } from "../src/semantics/contrast-slice";
import { auditMotionGeometry, type ElementGraph, type MovePlan, type RelationConstraint } from "../src/motion/elements";

const AT = 1.0;
const DUR = 4.0;

function build(text: string) {
  const evs = extractEvents(text, 7);
  const ev = evs.find((e) => e.type === "contrast");
  const plan = ev ? planContrast(ev) : null;
  if (!ev || !plan) throw new Error(`语料未命中转折：${text}`);
  const slice = buildContrastSlice(plan, "shot-audit", { hasCaption: true });
  return { ev, slice, graph: slice.graph, moves: contrastMoves(slice, AT, DUR), relations: contrastRelations(slice, AT, DUR, "editorial") };
}

function audit(g: { graph: ElementGraph; moves: MovePlan[]; relations: RelationConstraint[] }) {
  return auditMotionGeometry(g.graph, g.moves, g.relations, { from: AT, to: AT + DUR, fps: 30 });
}

describe("转折抽取", () => {
  it("虽然 A，但是 B → 抽出转折事件，实体为 concession/turn", () => {
    const evs = extractEvents("虽然天很冷，但是大家都来了。", 3);
    const ev = evs.find((e) => e.type === "contrast");
    expect(ev).toBeTruthy();
    expect(ev!.entities.map((e) => e.id).sort()).toEqual(["ent-concession", "ent-turn"]);
    expect(ev!.entities.find((e) => e.id === "ent-concession")!.name).toBe("天很冷");
    expect(ev!.entities.find((e) => e.id === "ent-turn")!.name).toBe("大家都来了");
  });

  it("A，然而 B → 抽出转折", () => {
    const ev = extractContrastEvent("方法对了，然而执行拖了后腿。", 4);
    expect(ev?.type).toBe("contrast");
    expect(ev?.entities.find((e) => e.id === "ent-turn")!.name).toBe("执行拖了后腿");
  });

  it("「不但…而且…」是递进，不画成转折", () => {
    const evs = extractEvents("他不但聪明，而且勤奋。", 5);
    expect(evs.find((e) => e.type === "contrast")).toBeFalsy();
    expect(evs[0]!.type).toBe("statement");
  });
});

describe("转折切片（合法构图）", () => {
  it("让步→转折标记→转折方的合法构图：落位后无违反，且含转折顺序断言", () => {
    const g = build("虽然天很冷，但是大家都来了。");
    const rep = audit(g);
    expect(rep.planErrors).toEqual([]);
    expect(rep.violations.filter((v) => v.severity === "error")).toEqual([]);
    expect(g.slice.plan.assertions).toContain("contrast-order");
    expect(g.slice.plan.assertions).toContain("concession-left");
    expect(g.slice.plan.assertions).toContain("turn-larger");
  });

  it("同一实体的文字与图形同组（fig ↔ label 共享语义实体与父组）", () => {
    const g = build("虽然天很冷，但是大家都来了。");
    const byId = new Map(g.graph.nodes.map((n) => [n.id, n]));
    for (const [fig, label] of [
      [NODE.figConcession, NODE.labelConcession],
      [NODE.figTurn, NODE.labelTurn],
    ] as const) {
      expect(byId.get(fig)!.semanticEntityId).toBe(byId.get(label)!.semanticEntityId);
      expect(byId.get(label)!.parentId).toBe(byId.get(fig)!.parentId);
    }
  });

  it("让步在左、转折在右；转折图形更大（话锋落点是重点）", () => {
    const g = build("虽然天很冷，但是大家都来了。");
    const byId = new Map(g.graph.nodes.map((n) => [n.id, n]));
    expect(byId.get(NODE.grpConcession)!.bounds.x).toBeLessThan(byId.get(NODE.grpTurn)!.bounds.x);
    const area = (id: string) => {
      const b = byId.get(id)!.bounds;
      return b.w * b.h;
    };
    expect(area(NODE.figTurn)).toBeGreaterThan(area(NODE.figConcession));
  });
});

describe("反向夹具：每个都必须失败并能定位", () => {
  it("① 转折方早于标记完成就显现：revealAfter 报错并给出时间点", () => {
    const g = build("虽然天很冷，但是大家都来了。");
    // 转折标记 0.55–0.95，这里让转折方 0.3 就开始入场
    for (const m of g.moves) if (m.id === "mv-turn-enter") { m.start = AT + 0.3; m.duration = 0.5; }
    const rep = audit(g);
    const v = rep.violations.find((x) => x.relationId === "rel-contrast-order");
    expect(v).toBeTruthy();
    expect(v!.type).toBe("revealAfter");
    expect(v!.at).toBeLessThan(AT + 0.95);
  });

  it("② 让步方与转折方意外重叠：净空报错（并给出重叠深度）", () => {
    const g = build("虽然天很冷，但是大家都来了。");
    const target = g.graph.nodes.find((n) => n.id === NODE.grpConcession)!.bounds;
    const shift = target.x - g.graph.nodes.find((n) => n.id === NODE.grpTurn)!.bounds.x;
    for (const n of g.graph.nodes) if (n.id === NODE.grpTurn || n.parentId === NODE.grpTurn) n.bounds = { ...n.bounds, x: n.bounds.x + shift };
    const rep = audit(g);
    const v = rep.violations.find((x) => x.relationId === "rel-clearance-groups" && x.severity === "error");
    expect(v).toBeTruthy();
    expect(v!.detail).toContain("已重叠");
    expect(rep.metrics.minClearance).toBeLessThan(0);
  });

  it("③ 方向反转：转折方画到左边 → rel-concession-left 报错", () => {
    const g = build("虽然天很冷，但是大家都来了。");
    for (const n of g.graph.nodes) if (n.parentId === NODE.grpTurn) n.bounds = { ...n.bounds, x: 128 };
    for (const n of g.graph.nodes) if (n.id === NODE.grpTurn) n.bounds = { ...n.bounds, x: 128 };
    const rep = audit(g);
    const v = rep.violations.find((x) => x.relationId === "rel-concession-left");
    expect(v).toBeTruthy();
    expect(v!.type).toBe("leftOf");
  });

  it("④ 保持区间内加入未声明漂移：holds 报错", () => {
    const g = build("虽然天很冷，但是大家都来了。");
    g.moves.push({
      id: "mv-undeclared-drift",
      targetId: NODE.grpConcession,
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
    const v = rep.violations.find((x) => x.relationId === "rel-hold-grp-concession");
    expect(v).toBeTruthy();
    expect(v!.detail).toContain("漂移");
  });
});
