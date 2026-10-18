// 否定切片测试（方案 §13 否定 / Phase 3）。
// 反向测试的判据：**每个夹具都必须有违反**，且违反要能定位到对象与时间点。
// 抽取层还要证明「要不是…」这类伪否定标记不画成否定。

import { describe, it, expect } from "vitest";
import { extractEvents, extractNegationEvent } from "../src/semantics/events";
import { planNegation } from "../src/semantics/negation-slice";
import { buildNegationSlice, negationMoves, negationRelations, NODE } from "../src/semantics/negation-slice";
import { auditMotionGeometry, type ElementGraph, type MovePlan, type RelationConstraint } from "../src/motion/elements";

const AT = 1.0;
const DUR = 4.0;

function build(text: string) {
  const evs = extractEvents(text, 7);
  const ev = evs.find((e) => e.type === "negation");
  const plan = ev ? planNegation(ev) : null;
  if (!ev || !plan) throw new Error(`语料未命中否定：${text}`);
  const slice = buildNegationSlice(plan, "shot-audit", { hasCaption: true });
  return { ev, slice, graph: slice.graph, moves: negationMoves(slice, AT, DUR), relations: negationRelations(slice, AT, DUR, "editorial") };
}

function audit(g: { graph: ElementGraph; moves: MovePlan[]; relations: RelationConstraint[] }) {
  return auditMotionGeometry(g.graph, g.moves, g.relations, { from: AT, to: AT + DUR, fps: 30 });
}

describe("否定抽取", () => {
  it("A 并不是 B → 抽出否定事件，实体为 affirm/negated", () => {
    const evs = extractEvents("鲸鱼并不是鱼。", 3);
    const ev = evs.find((e) => e.type === "negation");
    expect(ev).toBeTruthy();
    expect(ev!.entities.map((e) => e.id).sort()).toEqual(["ent-affirm", "ent-negated"]);
    expect(ev!.entities.find((e) => e.id === "ent-affirm")!.name).toBe("鲸鱼");
    expect(ev!.entities.find((e) => e.id === "ent-negated")!.name).toBe("鱼");
    expect(ev!.negated).toBe(true);
  });

  it("A 不是 B → 抽出否定", () => {
    const ev = extractNegationEvent("企鹅不是鱼。", 4);
    expect(ev?.type).toBe("negation");
    expect(ev?.entities.find((e) => e.id === "ent-affirm")!.name).toBe("企鹅");
    expect(ev?.entities.find((e) => e.id === "ent-negated")!.name).toBe("鱼");
  });

  it("「要不是…」是虚拟条件，不画成否定", () => {
    const evs = extractEvents("要不是天气好，比赛就取消了。", 5);
    expect(evs.find((e) => e.type === "negation")).toBeFalsy();
    expect(evs[0]!.type).toBe("statement");
  });
});

describe("否定切片（合法构图）", () => {
  it("被否定→删除线→确证的合法构图：落位后无违反，且含否定顺序断言", () => {
    const g = build("鲸鱼并不是鱼。");
    const rep = audit(g);
    expect(rep.planErrors).toEqual([]);
    expect(rep.violations.filter((v) => v.severity === "error")).toEqual([]);
    expect(g.slice.plan.assertions).toContain("negation-order");
    expect(g.slice.plan.assertions).toContain("negated-left");
    expect(g.slice.plan.assertions).toContain("affirm-larger");
  });

  it("同一实体的文字与图形同组（fig ↔ label 共享语义实体与父组）", () => {
    const g = build("鲸鱼并不是鱼。");
    const byId = new Map(g.graph.nodes.map((n) => [n.id, n]));
    for (const [fig, label] of [
      [NODE.figNegated, NODE.labelNegated],
      [NODE.figAffirm, NODE.labelAffirm],
    ] as const) {
      expect(byId.get(fig)!.semanticEntityId).toBe(byId.get(label)!.semanticEntityId);
      expect(byId.get(label)!.parentId).toBe(byId.get(fig)!.parentId);
    }
  });

  it("被否定在左、确证在右；确证图形更大（先破后立）", () => {
    const g = build("鲸鱼并不是鱼。");
    const byId = new Map(g.graph.nodes.map((n) => [n.id, n]));
    expect(byId.get(NODE.grpNegated)!.bounds.x).toBeLessThan(byId.get(NODE.grpAffirm)!.bounds.x);
    const area = (id: string) => {
      const b = byId.get(id)!.bounds;
      return b.w * b.h;
    };
    expect(area(NODE.figAffirm)).toBeGreaterThan(area(NODE.figNegated));
  });
});

describe("反向夹具：每个都必须失败并能定位", () => {
  it("① 确证方早于删除线完成就显现：revealAfter 报错并给出时间点", () => {
    const g = build("鲸鱼并不是鱼。");
    // 删除线 0.55–0.95，这里让确证方 0.3 就开始入场
    for (const m of g.moves) if (m.id === "mv-affirm-enter") { m.start = AT + 0.3; m.duration = 0.5; }
    const rep = audit(g);
    const v = rep.violations.find((x) => x.relationId === "rel-negation-order");
    expect(v).toBeTruthy();
    expect(v!.type).toBe("revealAfter");
    expect(v!.at).toBeLessThan(AT + 0.95);
  });

  it("② 被否定方与确证方意外重叠：净空报错（并给出重叠深度）", () => {
    const g = build("鲸鱼并不是鱼。");
    const target = g.graph.nodes.find((n) => n.id === NODE.grpNegated)!.bounds;
    const shift = target.x - g.graph.nodes.find((n) => n.id === NODE.grpAffirm)!.bounds.x;
    for (const n of g.graph.nodes) if (n.id === NODE.grpAffirm || n.parentId === NODE.grpAffirm) n.bounds = { ...n.bounds, x: n.bounds.x + shift };
    const rep = audit(g);
    const v = rep.violations.find((x) => x.relationId === "rel-clearance-groups" && x.severity === "error");
    expect(v).toBeTruthy();
    expect(v!.detail).toContain("已重叠");
    expect(rep.metrics.minClearance).toBeLessThan(0);
  });

  it("③ 方向反转：确证方画到左边 → rel-neg-left 报错", () => {
    const g = build("鲸鱼并不是鱼。");
    for (const n of g.graph.nodes) if (n.parentId === NODE.grpAffirm) n.bounds = { ...n.bounds, x: 128 };
    for (const n of g.graph.nodes) if (n.id === NODE.grpAffirm) n.bounds = { ...n.bounds, x: 128 };
    const rep = audit(g);
    const v = rep.violations.find((x) => x.relationId === "rel-neg-left");
    expect(v).toBeTruthy();
    expect(v!.type).toBe("leftOf");
  });

  it("④ 保持区间内加入未声明漂移：holds 报错", () => {
    const g = build("鲸鱼并不是鱼。");
    g.moves.push({
      id: "mv-undeclared-drift",
      targetId: NODE.grpNegated,
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
    const v = rep.violations.find((x) => x.relationId === "rel-hold-grp-negated");
    expect(v).toBeTruthy();
    expect(v!.detail).toContain("漂移");
  });
});
