// 变化切片测试（方案 §13 变化 / Phase 3）。
// 反向测试的判据：**每个夹具都必须有违反**，且违反要能定位到对象与时间点。
// 抽取层还要证明「从 A 到 B」这类纯区间不画成变化（只有时间/空间先后，没有变化标记）。

import { describe, it, expect } from "vitest";
import { extractEvents, extractChangeEvent } from "../src/semantics/events";
import { planChange } from "../src/semantics/change-slice";
import { buildChangeSlice, changeMoves, changeRelations, NODE } from "../src/semantics/change-slice";
import { auditMotionGeometry, type ElementGraph, type MovePlan, type RelationConstraint } from "../src/motion/elements";

const AT = 1.0;
const DUR = 4.0;

function build(text: string) {
  const evs = extractEvents(text, 7);
  const ev = evs.find((e) => e.type === "change");
  const plan = ev ? planChange(ev) : null;
  if (!ev || !plan) throw new Error(`语料未命中变化：${text}`);
  const slice = buildChangeSlice(plan, "shot-audit", { hasCaption: true });
  return { ev, slice, graph: slice.graph, moves: changeMoves(slice, AT, DUR), relations: changeRelations(slice, AT, DUR, "editorial") };
}

function audit(g: { graph: ElementGraph; moves: MovePlan[]; relations: RelationConstraint[] }) {
  return auditMotionGeometry(g.graph, g.moves, g.relations, { from: AT, to: AT + DUR, fps: 30 });
}

describe("变化抽取", () => {
  it("A 变成 B → 抽出变化事件，实体为 before/after", () => {
    const evs = extractEvents("毛毛虫变成了蝴蝶。", 3);
    const ev = evs.find((e) => e.type === "change");
    expect(ev).toBeTruthy();
    expect(ev!.entities.map((e) => e.id).sort()).toEqual(["ent-after", "ent-before"]);
    expect(ev!.entities.find((e) => e.id === "ent-before")!.name).toBe("毛毛虫");
    expect(ev!.entities.find((e) => e.id === "ent-after")!.name).toBe("蝴蝶");
  });

  it("A 化为 B → 抽出变化", () => {
    const ev = extractChangeEvent("积雪化为春水。", 4);
    expect(ev?.type).toBe("change");
    expect(ev?.entities.find((e) => e.id === "ent-after")!.name).toBe("春水");
  });

  it("情态动词紧贴标记词：归标记不归实体（真实语料「五十块想变成一百块」）", () => {
    const ev = extractChangeEvent("五十块想变成一百块，一次押完", 5);
    expect(ev?.type).toBe("change");
    expect(ev?.entities.find((e) => e.id === "ent-before")!.name).toBe("五十块");
    expect(ev?.entities.find((e) => e.id === "ent-after")!.name).toBe("一百块");
  });

  it("「从 A 到 B」是纯区间，没有变化标记 → 不画成变化", () => {
    const evs = extractEvents("从北京到上海，要飞两个小时。", 5);
    expect(evs.find((e) => e.type === "change")).toBeFalsy();
    expect(evs[0]!.type).toBe("statement");
  });
});

describe("变化切片（合法构图）", () => {
  it("之前→变化连线→之后的合法构图：落位后无违反，且含变化顺序断言", () => {
    const g = build("毛毛虫变成了蝴蝶。");
    const rep = audit(g);
    expect(rep.planErrors).toEqual([]);
    expect(rep.violations.filter((v) => v.severity === "error")).toEqual([]);
    expect(g.slice.plan.assertions).toContain("change-order");
    expect(g.slice.plan.assertions).toContain("before-left");
    expect(g.slice.plan.assertions).toContain("after-larger");
  });

  it("同一实体的文字与图形同组（fig ↔ label 共享语义实体与父组）", () => {
    const g = build("毛毛虫变成了蝴蝶。");
    const byId = new Map(g.graph.nodes.map((n) => [n.id, n]));
    for (const [fig, label] of [
      [NODE.figBefore, NODE.labelBefore],
      [NODE.figAfter, NODE.labelAfter],
    ] as const) {
      expect(byId.get(fig)!.semanticEntityId).toBe(byId.get(label)!.semanticEntityId);
      expect(byId.get(label)!.parentId).toBe(byId.get(fig)!.parentId);
    }
  });

  it("之前在左、之后在右；之后图形更大（变化的结果是重点）", () => {
    const g = build("毛毛虫变成了蝴蝶。");
    const byId = new Map(g.graph.nodes.map((n) => [n.id, n]));
    expect(byId.get(NODE.grpBefore)!.bounds.x).toBeLessThan(byId.get(NODE.grpAfter)!.bounds.x);
    const area = (id: string) => {
      const b = byId.get(id)!.bounds;
      return b.w * b.h;
    };
    expect(area(NODE.figAfter)).toBeGreaterThan(area(NODE.figBefore));
  });
});

describe("反向夹具：每个都必须失败并能定位", () => {
  it("① 之后方早于连线完成就显现：revealAfter 报错并给出时间点", () => {
    const g = build("毛毛虫变成了蝴蝶。");
    // 变化连线 0.55–0.95，这里让之后方 0.3 就开始入场
    for (const m of g.moves) if (m.id === "mv-after-enter") { m.start = AT + 0.3; m.duration = 0.5; }
    const rep = audit(g);
    const v = rep.violations.find((x) => x.relationId === "rel-change-order");
    expect(v).toBeTruthy();
    expect(v!.type).toBe("revealAfter");
    expect(v!.at).toBeLessThan(AT + 0.95);
  });

  it("② 之前方与之后方意外重叠：净空报错（并给出重叠深度）", () => {
    const g = build("毛毛虫变成了蝴蝶。");
    const target = g.graph.nodes.find((n) => n.id === NODE.grpBefore)!.bounds;
    const shift = target.x - g.graph.nodes.find((n) => n.id === NODE.grpAfter)!.bounds.x;
    for (const n of g.graph.nodes) if (n.id === NODE.grpAfter || n.parentId === NODE.grpAfter) n.bounds = { ...n.bounds, x: n.bounds.x + shift };
    const rep = audit(g);
    const v = rep.violations.find((x) => x.relationId === "rel-clearance-groups" && x.severity === "error");
    expect(v).toBeTruthy();
    expect(v!.detail).toContain("已重叠");
    expect(rep.metrics.minClearance).toBeLessThan(0);
  });

  it("③ 方向反转：之后方画到左边 → rel-before-left 报错", () => {
    const g = build("毛毛虫变成了蝴蝶。");
    for (const n of g.graph.nodes) if (n.parentId === NODE.grpAfter) n.bounds = { ...n.bounds, x: 128 };
    for (const n of g.graph.nodes) if (n.id === NODE.grpAfter) n.bounds = { ...n.bounds, x: 128 };
    const rep = audit(g);
    const v = rep.violations.find((x) => x.relationId === "rel-before-left");
    expect(v).toBeTruthy();
    expect(v!.type).toBe("leftOf");
  });

  it("④ 保持区间内加入未声明漂移：holds 报错", () => {
    const g = build("毛毛虫变成了蝴蝶。");
    g.moves.push({
      id: "mv-undeclared-drift",
      targetId: NODE.grpBefore,
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
    const v = rep.violations.find((x) => x.relationId === "rel-hold-grp-before");
    expect(v).toBeTruthy();
    expect(v!.detail).toContain("漂移");
  });
});
