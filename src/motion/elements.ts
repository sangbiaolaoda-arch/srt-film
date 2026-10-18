// 元素级运动 IR（方案 §3.2 / §4.2 层 A）。
//
// 这一层回答的问题是「每个输出帧上，谁在哪里、和谁保持什么关系」——纯函数、无 DOM。
// 它与 GSAP 的关系是**同一个事实的两种写法**：
//   · 这里按确定性时间输入求世界变换（可逐帧验算、可在 node 里跑）；
//   · motion/element-apply.ts 把同一份 MovePlan 编译成 GSAP tween（预览与导出）。
// 两边共用 `EASES` 与 `foldTransform` 的数学：ease 名不认识就报 planError，
// 绝不「差不多就行」—— 计划与实现不一致正是方案 §4.5 要求反向测试的那一类错。
//
// 坐标系：1280×720 画面坐标。元素 bounds 是**最终位置**（无动画时的位置），
// 运动只改祖先/自身的变换矩阵 —— 子节点不会被重复位移（方案 §3.3 第 2 条）。

/** 轴对齐包围盒（画面坐标）。 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 一个元素在某一时刻的局部变换。scale 绕 anchor 进行，rotation 本轮不开放。 */
export interface LocalTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
}

export const IDENTITY_TRANSFORM: LocalTransform = { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 };

export type ElementRole = "primary" | "secondary" | "annotation" | "background";

export interface ElementNode {
  id: string;
  kind: "text" | "svg" | "chart" | "shape" | "label" | "group";
  /** 绑定的语义实体 id（EntityRef.id）—— 文字与图形能对上，就因为共用这个 id */
  semanticEntityId?: string;
  /** 父节点：子节点的世界变换 = 祖先变换 ∘ 自身局部变换 */
  parentId?: string;
  /** 元素自身的局部变换（组运动之外另加的位移动画，默认单位变换） */
  localTransform: LocalTransform;
  /** 最终位置（画面坐标）。组运动在这里之外再做变换 */
  bounds: Box;
  /** 变换原点；缩放绕它进行。缺省取 bounds 中心（由 builder 显式写入，不靠浏览器猜） */
  anchor: { x: number; y: number };
  role: ElementRole;
}

export interface ElementGraph {
  shotId: string;
  nodes: ElementNode[];
}

export type MoveChannel = "transform" | "opacity" | "color" | "clip" | "stroke";

/** 一条声明式运动。start/duration 是**全局**秒（与 MotionPlan.at 同一时基）。 */
export interface MovePlan {
  id: string;
  /** 组优先；只有确实需要独立运动的叶子节点才指到叶子（方案 §3.3 第 1/2 条） */
  targetId: string;
  channel: MoveChannel;
  start: number;
  duration: number;
  /** 起始状态必须显式给出 —— 不能依赖上一次播放留在 DOM 上的状态 */
  from: Record<string, number | string>;
  to: Record<string, number | string>;
  ease: string;
  /** 为什么动（进报告的说明性证据，不是装饰） */
  reason: string;
  eventId?: string;
}

export type RelationType =
  | "follows"
  | "holds"
  | "leftOf"
  | "rightOf"
  | "largerThan"
  | "contrastAtLeast"
  | "clearanceAtLeast"
  | "insideSafeArea"
  | "revealAfter";

export interface RelationConstraint {
  id: string;
  type: RelationType;
  sourceIds: string[];
  params: Record<string, number | string | boolean>;
  /** 生效区间（全局秒，闭区间） */
  activeDuring: [number, number];
  severity: "error" | "warning" | "review";
}

/* ── 缓动：与 GSAP 同公式的那一小撮。名字不认识 = planError，不静默兜底 ───────── */
/** GSAP 的 powerN 是多项式：power1=quad(2)、power2=cubic(3)、power3=quart(4)、power4=quint(5)。 */
export const EASES: Record<string, (p: number) => number> = {
  none: (p) => p,
  linear: (p) => p,
  "power1.out": (p) => 1 - (1 - p) ** 2,
  "power2.out": (p) => 1 - (1 - p) ** 3,
  "power3.out": (p) => 1 - (1 - p) ** 4,
  "power4.out": (p) => 1 - (1 - p) ** 5,
  "power1.in": (p) => p ** 2,
  "power2.in": (p) => p ** 3,
  "power2.inOut": (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
  "sine.inOut": (p) => -(Math.cos(Math.PI * p) - 1) / 2,
};

export function easeOf(name: string): ((p: number) => number) | null {
  return EASES[name] ?? null;
}

/* ── 2D 仿射矩阵（a b c d e f，等价于 CSS matrix(a,b,c,d,e,f)）──────────────── */
export type Mat = readonly [number, number, number, number, number, number];

export const MAT_ID: Mat = [1, 0, 0, 1, 0, 0];

export function matMul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function applyMat(m: Mat, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** 局部变换 → 矩阵。缩放绕 anchor（画面坐标）进行，不用浏览器隐式中心。 */
export function matrixOf(t: LocalTransform, anchor: { x: number; y: number }): Mat {
  const a: Mat = [1, 0, 0, 1, t.x, t.y];
  const b: Mat = [1, 0, 0, 1, anchor.x, anchor.y];
  const c: Mat = [t.scaleX, 0, 0, t.scaleY, 0, 0];
  const d: Mat = [1, 0, 0, 1, -anchor.x, -anchor.y];
  return matMul(matMul(matMul(a, b), c), d);
}

export function boxOf(m: Mat, b: Box): Box {
  const pts = [
    applyMat(m, b.x, b.y),
    applyMat(m, b.x + b.w, b.y),
    applyMat(m, b.x, b.y + b.h),
    applyMat(m, b.x + b.w, b.y + b.h),
  ];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/* ── 求值 ────────────────────────────────────────────────────────────────── */

export interface NodeState {
  id: string;
  /** 世界矩阵（含全部祖先） */
  matrix: Mat;
  /** 世界不透明度（沿祖先链相乘） */
  opacity: number;
  /** 世界包围盒（AABB） */
  box: Box;
  /** 世界中心的位移（相对最终位置中心）—— 报告里用来读「谁动了多少」 */
  offset: { x: number; y: number };
}

/** 声明层校验：未知 ease、rotation、同目标同属性重叠 —— 都是计划本身的错，先于几何检查。 */
export function validateMoves(graph: ElementGraph, moves: MovePlan[]): string[] {
  const errs: string[] = [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const m of moves) {
    if (!byId.has(m.targetId)) errs.push(`move ${m.id}：目标节点 ${m.targetId} 不在元素图里`);
    if (!easeOf(m.ease)) errs.push(`move ${m.id}：缓动「${m.ease}」不在 IR 白名单（计划与渲染必然不一致）`);
    if (m.duration <= 0) errs.push(`move ${m.id}：时长必须为正（${m.duration}）`);
    for (const k of Object.keys({ ...m.from, ...m.to })) {
      if (k === "rotation") errs.push(`move ${m.id}：rotation 本轮不开放（方案 §3.3 第 6 条：坐标系与原点要确定）`);
    }
  }
  // 同目标 + 同属性 + 时间重叠 = 未声明的重叠 tween
  const byTarget = new Map<string, MovePlan[]>();
  for (const m of moves) byTarget.set(m.targetId, [...(byTarget.get(m.targetId) ?? []), m]);
  for (const [tid, list] of byTarget) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const overlap = a.start < b.start + b.duration && b.start < a.start + a.duration;
        if (!overlap) continue;
        const props = new Set([...Object.keys(a.to), ...Object.keys(b.to)]);
        const shared = [...props].filter((p) => p in a.to && p in b.to);
        if (shared.length) {
          errs.push(`move ${a.id} 与 ${b.id} 在 ${tid} 上重叠写同一属性（${shared.join("/")}）—— 必须显式声明组合方式`);
        }
      }
    }
  }
  return errs;
}

/** 把一条 move 的 from/to 按缓动进度 p 写入状态（只认白名单属性）。 */
function writeProps(st: LocalTransform, m: MovePlan, p: number): void {
  for (const [k, toV] of Object.entries(m.to)) {
    if (k !== "x" && k !== "y" && k !== "scale" && k !== "scaleX" && k !== "scaleY" && k !== "opacity") continue;
    const fromRaw = m.from[k];
    const cur = (st as unknown as Record<string, number>)[k] ?? (k === "scale" ? 1 : 0);
    const fromV = fromRaw === undefined ? cur : Number(fromRaw);
    const v = fromV + (Number(toV) - fromV) * p;
    if (k === "scale") {
      st.scaleX = v;
      st.scaleY = v;
    } else {
      (st as unknown as Record<string, number>)[k] = v;
    }
  }
}

/** 把落在某节点上的 move 折叠成该时刻的局部变换。 */
export function foldTransform(moves: MovePlan[], targetId: string, t: number, base: LocalTransform = IDENTITY_TRANSFORM): LocalTransform {
  const st: LocalTransform = { ...base };
  const list = moves.filter((m) => m.targetId === targetId).slice().sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  const first = list[0];
  // 入场前：元素已经按第一条 move 的 from 置位（编译层 tl.set(..., 0) 与此同口径）——
  // 不这样算，「入场开始前」这一段 IR 说在终点、画面停在起点，浏览器校准会全红。
  if (first && t < first.start) writeProps(st, first, 0);
  for (const m of list) {
    if (t < m.start) continue;
    const ease = easeOf(m.ease) ?? ((p: number) => p);
    const raw = m.duration <= 0 ? 1 : Math.min(1, Math.max(0, (t - m.start) / m.duration));
    writeProps(st, m, ease(raw));
  }
  return st;
}

/** 求某一时刻整张元素图的世界状态。纯函数：同输入必然同输出。 */
export function evaluateMotionPlan(graph: ElementGraph, moves: MovePlan[], t: number): Map<string, NodeState> {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const out = new Map<string, NodeState>();
  const visiting = new Set<string>();

  const resolve = (id: string): NodeState => {
    const cached = out.get(id);
    if (cached) return cached;
    const node = byId.get(id);
    if (!node) throw new Error(`元素图缺少节点 ${id}`);
    if (visiting.has(id)) throw new Error(`元素图存在环：${[...visiting].join(" → ")} → ${id}`);
    visiting.add(id);
    const local = foldTransform(moves, id, t, node.localTransform);
    const selfM = matrixOf(local, node.anchor);
    const parent = node.parentId ? resolve(node.parentId) : null;
    const matrix = parent ? matMul(parent.matrix, selfM) : selfM;
    const opacity = (parent?.opacity ?? 1) * local.opacity;
    visiting.delete(id);
    const box = boxOf(matrix, node.bounds);
    const baseC = { x: node.bounds.x + node.bounds.w / 2, y: node.bounds.y + node.bounds.h / 2 };
    const c = applyMat(matrix, baseC.x, baseC.y);
    const state: NodeState = { id, matrix, opacity, box, offset: { x: c.x - baseC.x, y: c.y - baseC.y } };
    out.set(id, state);
    return state;
  };

  for (const n of graph.nodes) resolve(n.id);
  return out;
}

/* ── 关系验算（方案 §4.2 层 A）────────────────────────────────────────────── */

export type CheckType = RelationType | "move-conflict" | "easing-unsupported";

/** revealAfter 的生效门限：连接完成前目标不透明度必须低于此值（视为「尚未显现」）。 */
export const REVEAL_GATE_OPACITY = 0.01;

export interface GeometryViolation {
  relationId: string;
  type: CheckType;
  severity: "error" | "warning" | "review";
  /** 出问题的时刻（全局秒）与输出帧号 —— 报告必须能定位到时间点 */
  at: number;
  frame: number;
  sourceIds: string[];
  /** 具体偏差（数值），不是「失败」两个字 */
  detail: string;
}

export interface GeometryMetrics {
  maxFollowDeviation: number;
  maxHoldDrift: number;
  minClearance: number;
  minContrast: number;
  maxSafeAreaOverflow: number;
}

export interface GeometryReport {
  shotId: string;
  from: number;
  to: number;
  fps: number;
  framesChecked: number;
  relationChecks: number;
  failedChecks: number;
  violations: GeometryViolation[];
  metrics: GeometryMetrics;
  planErrors: string[];
}

export interface AuditOptions {
  from: number;
  to: number;
  fps?: number;
  /** 只报第一个违反点：报告可读性用（默认 false = 全部报，但有上限） */
  maxViolationsPerRelation?: number;
}

/**
 * 「谁动了多少」—— follows 量的就是这个，不是固有位置差。
 * 同一时刻两个子节点的世界位移应当相同（组变换是唯一来源）：固有高度差是几何事实，
 * 把它算成「偏离」会让合法构图永远报错（实测：图形与标签高度差 5.87px 被误报）。
 */
function worldOffset(states: Map<string, NodeState>, id: string, graph: ElementGraph): { x: number; y: number } {
  const s = states.get(id)!;
  const node = graph.nodes.find((n) => n.id === id)!;
  const baseC = { x: node.bounds.x + node.bounds.w / 2, y: node.bounds.y + node.bounds.h / 2 };
  const c = applyMat(s.matrix, baseC.x, baseC.y);
  return { x: c.x - baseC.x, y: c.y - baseC.y };
}

/** 两个盒子的最小净空：负值 = 重叠深度（沿穿透最浅的轴）。 */
export function clearance(a: Box, b: Box): number {
  const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  if (dx >= 0 || dy >= 0) return Math.max(dx, dy);
  return Math.max(dx, dy); // 两者都为负 → 取「穿透最浅」的那条轴（负值）
}

/** 安全区溢出量（px）：0 = 完全在安全区内。 */
function safeAreaOverflow(b: Box, margin: number, stage: { w: number; h: number }): number {
  return Math.max(
    0,
    margin - b.x,
    margin - b.y,
    b.x + b.w - (stage.w - margin),
    b.y + b.h - (stage.h - margin),
  );
}

/* ── 对比度（WCAG 2.2）：按**合成后**的实际前景色算，不是比较设计 token ────────── */function parseColor(c: string): [number, number, number, number] | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (hex) {
    const v = hex[1]!;
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16), 1];
  }
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(c.trim());
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), rgba[4] === undefined ? 1 : Number(rgba[4])];
  return null;
}

function composite(fg: [number, number, number, number], bg: [number, number, number, number]): [number, number, number] {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];
}

function relLum(rgb: [number, number, number]): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}

/** WCAG 对比度。fg 的 alpha 与元素世界不透明度相乘后再合成到 bg 上 —— 变淡后仍须可读。 */
export function contrastRatio(fg: string, bg: string, alpha = 1): number {
  const F = parseColor(fg);
  const B = parseColor(bg);
  if (!F || !B) return NaN;
  const composed = composite([F[0], F[1], F[2], F[3] * alpha], B);
  const l1 = relLum(composed);
  const l2 = relLum([B[0], B[1], B[2]]);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 逐输出帧验算。这是方案 §4.2 的「层 A」：纯计算、覆盖全部帧，不启浏览器。
 * 每个关系都必须由**模板参数**驱动（谁和谁、哪个区间、允许多少），不在类型里写死方向。
 */
export function auditMotionGeometry(
  graph: ElementGraph,
  moves: MovePlan[],
  relations: RelationConstraint[],
  opts: AuditOptions,
): GeometryReport {
  const fps = opts.fps ?? 30;
  const maxPer = opts.maxViolationsPerRelation ?? 3;
  const planErrors = validateMoves(graph, moves);
  const violations: GeometryViolation[] = [];
  const metrics: GeometryMetrics = {
    maxFollowDeviation: 0,
    maxHoldDrift: 0,
    minClearance: Infinity,
    minContrast: Infinity,
    maxSafeAreaOverflow: 0,
  };

  // 计划层错误直接影响结论可信度：先按 error 记，且仍然跑几何（能跑就给出更多证据）
  for (const e of planErrors) {
    violations.push({ relationId: "plan", type: "move-conflict", severity: "error", at: opts.from, frame: 0, sourceIds: [], detail: e });
  }

  // holds 的参考状态取生效区间的第一帧
  const holdRef = new Map<string, Map<string, NodeState>>();
  for (const r of relations) {
    if (r.type !== "holds") continue;
    holdRef.set(r.id, evaluateMotionPlan(graph, moves, r.activeDuring[0]));
  }

  const frames = Math.max(1, Math.round((opts.to - opts.from) * fps));
  const counts = new Map<string, number>();
  let relationChecks = 0;

  for (let i = 0; i <= frames; i++) {
    const t = Number((opts.from + i / fps).toFixed(6));
    const states = evaluateMotionPlan(graph, moves, t);
    for (const r of relations) {
      const [a0, a1] = r.activeDuring;
      if (t < a0 - 1e-9 || t > a1 + 1e-9) continue;
      relationChecks++;

      const push = (detail: string, type: CheckType = r.type) => {
        const n = counts.get(r.id) ?? 0;
        counts.set(r.id, n + 1);
        if (n >= maxPer) return;
        violations.push({ relationId: r.id, type, severity: r.severity, at: t, frame: Math.round(t * fps), sourceIds: r.sourceIds, detail });
      };
      const get = (id: string): NodeState => {
        const s = states.get(id);
        if (!s) throw new Error(`关系 ${r.id} 引用了不存在的节点 ${id}`);
        return s;
      };

      switch (r.type) {
        case "follows": {
          const [a, b] = r.sourceIds;
          if (!a || !b) break;
          // 相对位移必须成对：同一时刻 A 动了多少，B 也必须动多少
          const oa = worldOffset(states, a, graph);
          const ob = worldOffset(states, b, graph);
          const dev = Math.hypot(oa.x - ob.x, oa.y - ob.y);
          metrics.maxFollowDeviation = Math.max(metrics.maxFollowDeviation, dev);
          const tol = Number(r.params.maxDeviation ?? 1.5);
          if (dev > tol) {
            push(
              `${a} 与 ${b} 的相对位移偏离 ${dev.toFixed(2)}px > ${tol}px（一个动了 ${oa.x.toFixed(1)},${oa.y.toFixed(1)}，另一个只动了 ${ob.x.toFixed(1)},${ob.y.toFixed(1)}）`,
            );
          }
          break;
        }
        case "holds": {
          const ref = holdRef.get(r.id);
          if (!ref) break;
          const tol = Number(r.params.maxDelta ?? 0.5);
          for (const id of r.sourceIds) {
            const s = get(id);
            const r0 = ref.get(id)!;
            const d = Math.hypot(s.box.x - r0.box.x, s.box.y - r0.box.y);
            const ds = Math.abs(s.box.w - r0.box.w) + Math.abs(s.box.h - r0.box.h);
            const drift = Math.max(d, ds);
            metrics.maxHoldDrift = Math.max(metrics.maxHoldDrift, drift);
            if (drift > tol) push(`${id} 在保持区间漂移 ${drift.toFixed(2)}px > ${tol}px（有未声明的运动）`);
          }
          break;
        }
        case "leftOf":
        case "rightOf": {
          const [a, b] = r.sourceIds;
          if (!a || !b) break;
          const gapParam = Number(r.params.minGap ?? 0);
          const A = get(a);
          const B = get(b);
          // leftOf：A 在 B 的左边。用「A 的右边界 → B 的左边界」的净空表达
          const gap = r.type === "leftOf" ? B.box.x - (A.box.x + A.box.w) : A.box.x - (B.box.x + B.box.w);
          metrics.minClearance = Math.min(metrics.minClearance, gap);
          if (gap < gapParam) {
            push(
              r.type === "leftOf"
                ? `${a} 未保持在 ${b} 左侧：净空 ${gap.toFixed(1)}px < ${gapParam}px`
                : `${a} 未保持在 ${b} 右侧：净空 ${gap.toFixed(1)}px < ${gapParam}px`,
            );
          }
          break;
        }
        case "clearanceAtLeast": {
          const [a, b] = r.sourceIds;
          if (!a || !b) break;
          const min = Number(r.params.min ?? 0);
          const gap = clearance(get(a).box, get(b).box);
          metrics.minClearance = Math.min(metrics.minClearance, gap);
          if (gap < min) push(`${a} 与 ${b} 净空 ${gap.toFixed(1)}px < ${min}px${gap < 0 ? "（已重叠）" : ""}`);
          break;
        }
        case "largerThan": {
          const [a, b] = r.sourceIds;
          if (!a || !b) break;
          const ratio = Number(r.params.minRatio ?? 1);
          const A = get(a).box;
          const B = get(b).box;
          const r0 = (A.w * A.h) / Math.max(1, B.w * B.h);
          if (r0 < ratio) push(`${a} 面积比 ${b} 只有 ${r0.toFixed(2)}× < 声明要求的 ${ratio}×`);
          break;
        }
        case "insideSafeArea": {
          const margin = Number(r.params.margin ?? 24);
          const stage = { w: Number(r.params.stageW ?? 1280), h: Number(r.params.stageH ?? 720) };
          for (const id of r.sourceIds) {
            const ov = safeAreaOverflow(get(id).box, margin, stage);
            metrics.maxSafeAreaOverflow = Math.max(metrics.maxSafeAreaOverflow, ov);
            if (ov > 0) push(`${id} 越出安全区 ${ov.toFixed(1)}px（margin=${margin}）`);
          }
          break;
        }
        case "contrastAtLeast": {
          const min = Number(r.params.min ?? 4.5);
          const fg = String(r.params.fg ?? "");
          const bg = String(r.params.bg ?? "");
          for (const id of r.sourceIds) {
            const ratio = contrastRatio(fg, bg, get(id).opacity);
            if (Number.isNaN(ratio)) {
              push(`对比度无法计算：fg=${fg} bg=${bg} 解析失败`, "contrastAtLeast");
              break;
            }
            metrics.minContrast = Math.min(metrics.minContrast, ratio);
            if (ratio < min) push(`${id} 对比度 ${ratio.toFixed(2)}:1 < ${min}:1（fg=${fg} bg=${bg} 不透明度 ${get(id).opacity.toFixed(2)}）`);
          }
          break;
        }
        case "revealAfter": {
          // 因果顺序专用：在 gateAt 之前，目标必须保持「未显现」（不透明度低于门限）。
          // 一旦它早于连线/前置条件完成就露脸，就是「把先后当成因果」或「因果倒置」——
          // 方案 §5.3/§11 case 5 明确禁止「只有时间先后、没有因果证据就画成因果」。
          const gateAt = Number(r.params.gateAt ?? 0);
          if (t < gateAt - 1e-9 && r.sourceIds.length > 0) {
            const id = r.sourceIds[0]!;
            const op = get(id).opacity;
            if (op > REVEAL_GATE_OPACITY) {
              push(`${id} 在因果连接完成前（${gateAt.toFixed(2)}s）就显现了（不透明度 ${op.toFixed(2)}）—— 因果顺序错误`, "revealAfter");
            }
          }
          break;
        }
      }
    }
  }

  const failedChecks = violations.filter((v) => v.severity === "error").length;
  return {
    shotId: graph.shotId,
    from: opts.from,
    to: opts.to,
    fps,
    framesChecked: frames + 1,
    relationChecks,
    failedChecks,
    violations,
    metrics: {
      ...metrics,
      minClearance: Number.isFinite(metrics.minClearance) ? metrics.minClearance : 0,
      minContrast: Number.isFinite(metrics.minContrast) ? metrics.minContrast : 0,
    },
    planErrors,
  };
}
