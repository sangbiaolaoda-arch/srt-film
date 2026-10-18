// 组级运动 IR + 比较切片测试（方案 §4.2 层 A / §5.4 模板参数驱动）。
// 反向测试的判据：**每个夹具都必须有违反**，且违反要能定位到对象与时间点。

import { describe, it, expect } from "vitest";
import { extractEvents } from "../src/semantics/events";
import { planComparison } from "../src/semantics/visual-plan";
import { buildCompareSlice, compareMoves, compareRelations, NODE } from "../src/semantics/compare-slice";
import { auditMotionGeometry, evaluateMotionPlan, type ElementGraph, type MovePlan, type RelationConstraint } from "../src/motion/elements";

const AT = 1.0;
const DUR = 4.0;

function build(text: string) {
  const evs = extractEvents(text, 7);
  const plan = planComparison(evs.find((e) => e.type === "compare")!)!;
  const slice = buildCompareSlice(plan, "shot-audit", { hasCaption: true });
  return {
    slice,
    graph: slice.graph,
    moves: compareMoves(slice, AT, DUR),
    relations: compareRelations(slice, AT, DUR, "editorial"),
  };
}

function audit(g: { graph: ElementGraph; moves: MovePlan[]; relations: RelationConstraint[] }) {
  return auditMotionGeometry(g.graph, g.moves, g.relations, { from: AT, to: AT + DUR, fps: 30 });
}

describe("比较切片（合法构图）", () => {
  it("占优模板：落位后无违反，且断言覆盖了方向/尺度", () => {
    const g = build("精装书比平装书好，字大行疏，读起来不费劲。");
    const rep = audit(g);
    expect(rep.planErrors).toEqual([]);
    expect(rep.violations.filter((v) => v.severity === "error")).toEqual([]);
    // 断言由模板参数生成：不是「所有比较都 winner 在右」
    const plan = g.slice.plan;
    expect(plan.finalLayout.primarySide).toBe("right");
    expect(plan.assertions).toContain("final-order");
    expect(plan.assertions).toContain("primary-larger");
  });

  it("中性模板：不声明任何优劣断言", () => {
    const g = build("精装书比平装书贵。");
    const rep = audit(g);
    expect(rep.violations.filter((v) => v.severity === "error")).toEqual([]);
    const ids = g.relations.map((r) => r.id);
    expect(ids).not.toContain("rel-final-order");
    expect(ids).not.toContain("rel-primary-larger");
    expect(g.slice.plan.degraded).toContain("不声明优劣");
  });

  it("组内文字与图形同属一个语义实体（绑定的代码化）", () => {
    const g = build("精装书比平装书好，字大行疏。");
    const byId = new Map(g.graph.nodes.map((n) => [n.id, n]));
    for (const [fig, label] of [
      [NODE.figPrimary, NODE.labelPrimary],
      [NODE.figSecondary, NODE.labelSecondary],
    ] as const) {
      expect(byId.get(fig)!.semanticEntityId).toBe(byId.get(label)!.semanticEntityId);
      expect(byId.get(label)!.parentId).toBe(NODE.grpPrimary === byId.get(fig)!.parentId ? NODE.grpPrimary : NODE.grpSecondary);
    }
  });

  it("子节点的局部变换恒为单位 —— 组是唯一位移来源", () => {
    const g = build("精装书比平装书好，字大行疏。");
    for (const n of g.graph.nodes) {
      if (n.kind === "group") continue;
      expect(n.localTransform).toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 });
    }
  });
});

describe("反向夹具：每个都必须失败并能定位", () => {
  it("① 组内标签脱离组：跟随关系报错并给出偏差", () => {
    const g = build("精装书比平装书好，字大行疏。");
    for (const n of g.graph.nodes) if (n.id === NODE.labelPrimary) n.parentId = undefined;
    const rep = audit(g);
    const v = rep.violations.find((x) => x.relationId === "rel-follow-label-primary");
    expect(v).toBeTruthy();
    expect(v!.type).toBe("follows");
    expect(v!.detail).toContain("偏离");
    expect(v!.at).toBeGreaterThanOrEqual(AT);
  });

  it("② 子节点额外位移 20px：报错且指出谁动了多少", () => {
    const g = build("精装书比平装书好，字大行疏。");
    for (const n of g.graph.nodes) if (n.id === NODE.figSecondary) n.localTransform = { ...n.localTransform, x: 20 };
    const rep = audit(g);
    const v = rep.violations.find((x) => x.relationId === "rel-follow-label-secondary");
    expect(v).toBeTruthy();
    expect(v!.detail).toMatch(/偏离 20\.00px/);
  });

  it("③ 保持区间内加入未声明漂移：holds 报错", () => {
    const g = build("精装书比平装书好，字大行疏。");
    g.moves.push({
      id: "mv-undeclared-drift",
      targetId: NODE.grpPrimary,
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
    const v = rep.violations.find((x) => x.relationId === "rel-hold-grp-primary");
    expect(v).toBeTruthy();
    expect(v!.detail).toContain("漂移");
  });

  it("④ 两个主对象意外重叠：净空报错（并给出重叠深度）", () => {
    const g = build("精装书比平装书好，字大行疏。");
    // 把主体组整体搬到参照组的位置上 —— 这才是「两个独立主对象意外碰撞」
    // （单纯把参照组推出画布只会触发安全区，两者净空反而更大）
    const target = g.graph.nodes.find((n) => n.id === NODE.grpSecondary)!.bounds;
    const shift = target.x - g.graph.nodes.find((n) => n.id === NODE.grpPrimary)!.bounds.x;
    for (const n of g.graph.nodes) if (n.id === NODE.grpPrimary || n.parentId === NODE.grpPrimary) n.bounds = { ...n.bounds, x: n.bounds.x + shift };
    const rep = audit(g);
    const errs = rep.violations.filter((v) => v.severity === "error");
    expect(errs.length).toBeGreaterThan(0);
    expect(rep.violations.some((v) => v.relationId === "rel-clearance-groups" && v.severity === "error")).toBe(true);
    expect(rep.metrics.minClearance).toBeLessThan(0);
    const v = rep.violations.find((x) => x.relationId === "rel-clearance-groups")!;
    expect(v.detail).toContain("已重叠");
    expect(v.detail).toMatch(/-\d+\.\d+px/); // 具体重叠深度，不是「失败」两个字
  });
  it("⑤ 元素出安全区：报出越界像素数", () => {
    const g = build("精装书比平装书好，字大行疏。");
    for (const n of g.graph.nodes) if (n.id === NODE.grpSecondary) n.bounds = { ...n.bounds, x: 1290 };
    const rep = audit(g);
    expect(rep.violations.some((x) => x.relationId === "rel-safe-area")).toBe(true);
  });

  it("⑥ 比较方向反转：final-order 报错", () => {
    const g = build("精装书比平装书好，字大行疏。");
    for (const n of g.graph.nodes) if (n.parentId === NODE.grpPrimary) n.bounds = { ...n.bounds, x: 128 };
    for (const n of g.graph.nodes) if (n.id === NODE.grpPrimary) n.bounds = { ...n.bounds, x: 128 };
    const rep = audit(g);
    const v = rep.violations.find((x) => x.relationId === "rel-final-order");
    expect(v).toBeTruthy();
    expect(v!.type).toBe("leftOf");
  });

  it("⑦ 计划用了 IR 不认识的缓动：计划层错误（计划与渲染必然不一致）", () => {
    const g = build("精装书比平装书好，字大行疏。");
    for (const m of g.moves) if (m.id === "mv-primary-enter") m.ease = "elastic.out(1,0.3)";
    const rep = audit(g);
    expect(rep.planErrors.length).toBeGreaterThan(0);
    expect(rep.planErrors[0]).toContain("不在 IR 白名单");
  });

  it("⑧ 同一目标同一属性重叠写：未声明组合被拦下", () => {
    const g = build("精装书比平装书好，字大行疏。");
    // 与 mv-secondary-yield（1.40s 起 0.52s）在同一目标同一属性 x 上时间重叠
    g.moves.push({
      id: "mv-conflicting",
      targetId: NODE.grpSecondary,
      channel: "transform",
      start: AT + 0.5,
      duration: 0.5,
      from: { x: 0 },
      to: { x: 30 },
      ease: "power2.out",
      reason: "（未声明）",
      eventId: "ev-7",
    });
    const rep = audit(g);
    expect(rep.planErrors.some((e) => e.includes("重叠写同一属性"))).toBe(true);
  });
});

describe("IR 求值的确定性", () => {
  it("同一时刻两次求值结果深相等", () => {
    const g = build("精装书比平装书好，字大行疏。");
    const a = evaluateMotionPlan(g.graph, g.moves, 1.7);
    const b = evaluateMotionPlan(g.graph, g.moves, 1.7);
    expect(JSON.stringify([...a])).toBe(JSON.stringify([...b]));
  });

  it("hold 之后世界盒不再变化（入场后保持）", () => {
    const g = build("精装书比平装书好，字大行疏。");
    const holdFrom = AT + 2.2;
    const a = evaluateMotionPlan(g.graph, g.moves, holdFrom);
    const b = evaluateMotionPlan(g.graph, g.moves, AT + DUR);
    for (const id of [NODE.grpPrimary, NODE.grpSecondary]) {
      expect(JSON.stringify(a.get(id)!.box)).toBe(JSON.stringify(b.get(id)!.box));
    }
  });
});
