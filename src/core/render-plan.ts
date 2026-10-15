// 统一中间数据契约（Render Plan）—— 所有模块共同遵守的单一事实来源。
// plan() 产出的是 Shot[]（每拍一个 ScenePlan 的雏形），本模块把它包成一份带
// schema 版本、画布、风格档、导出配置的完整 RenderPlan，并提供校验与 (反)序列化，
// 让「保存工程 JSON」成为 schema 背书、可复现、可迁移的产物，而不是临时拼装的对象。

import type { PlanResult } from "./plan";
import type { Shot } from "./shot";
import type { Style } from "../layouts/types";
import type { NarrativeRole } from "./compose";

export const RENDER_PLAN_SCHEMA = "srt-film/render-plan";
export const RENDER_PLAN_VERSION = 1;

export const EXPORT_W = 1920;
export const EXPORT_H = 1080;
export const EXPORT_FPS = 30;

export interface RenderCanvas {
  width: number;
  height: number;
  fps: number;
  /** 安全区（归一化 0..1，相对画布）。缺省全画布 */
  safeArea?: { x: number; y: number; w: number; h: number };
}

export interface RenderPlanExport {
  codec: "avc";
  container: "mp4";
  /** 本项目固定无音轨 */
  audio: false;
}

/** 一拍的规划（对应 plan() 产出的 Shot，附加溯源与转场元数据）。 */
export interface ScenePlan {
  id: string;
  start: number;
  end: number;
  duration: number;
  /** 来自哪些 SRT cue（plan §4 sourceCueIds） */
  sourceCueIds: number[];
  layoutId: string;
  layoutName: string;
  style: Style;
  headline: string;
  /** Phase 4 叙事层：角色/目的/禁区（不臆造） */
  role: NarrativeRole;
  purpose: string;
  forbidden: string[];
  /** GSAP 时间轴上的起点（拍间交叠，≠ SRT 绝对时间） */
  tlStart?: number;
}

export interface RenderPlan {
  schema: typeof RENDER_PLAN_SCHEMA;
  version: number;
  projectId: string;
  /** 可追溯的字幕摘要/原文（复现用） */
  sourceSrt: string;
  canvas: RenderCanvas;
  /** 全片风格档 id（本项目为 editorial / flat-vector / chart-motion 三系，记录主系） */
  styleProfile: string;
  scenes: ScenePlan[];
  export: RenderPlanExport;
  generatedAt: string;
}

function toScene(shot: Shot, i: number): ScenePlan {
  return {
    id: `scene-${i + 1}`,
    start: shot.start,
    end: shot.end,
    duration: shot.end - shot.start,
    sourceCueIds: shot.cueIds ?? [],
    layoutId: shot.layout.id,
    layoutName: shot.layout.name,
    style: shot.layout.style ?? "editorial",
    headline: shot.content.headline,
    role: shot.narrative?.role ?? "explanation",
    purpose: shot.narrative?.purpose ?? "",
    forbidden: shot.narrative?.forbidden ?? [],
    tlStart: shot.tlStart,
  };
}

/** 把规划结果包成完整的、可序列化的 RenderPlan。 */
export function toRenderPlan(
  result: PlanResult,
  opts: { srt: string; projectId?: string; styleProfile?: string },
): RenderPlan {
  return {
    schema: RENDER_PLAN_SCHEMA,
    version: RENDER_PLAN_VERSION,
    projectId: opts.projectId ?? "srt-film",
    sourceSrt: opts.srt,
    canvas: { width: EXPORT_W, height: EXPORT_H, fps: EXPORT_FPS },
    styleProfile: opts.styleProfile ?? "editorial",
    scenes: result.shots.map(toScene),
    export: { codec: "avc", container: "mp4", audio: false },
    generatedAt: new Date().toISOString(),
  };
}

/** 校验 RenderPlan 的结构合法性；返回硬错误列表（空 = 通过）。 */
export function validateRenderPlan(p: unknown): string[] {
  const errs: string[] = [];
  if (!p || typeof p !== "object") return ["RenderPlan 不是对象"];
  const o = p as Record<string, any>;
  if (o.schema !== RENDER_PLAN_SCHEMA) errs.push("schema 字段缺失或错误");
  if (o.version !== RENDER_PLAN_VERSION) errs.push(`version 应为 ${RENDER_PLAN_VERSION}，实际 ${o.version}`);
  const c = o.canvas;
  if (!c || c.width <= 0 || c.height <= 0 || c.fps <= 0) errs.push("canvas 尺寸/帧率非法");
  const sc = o.scenes;
  if (!Array.isArray(sc) || sc.length === 0) {
    errs.push("scenes 为空");
  } else {
    sc.forEach((s: Record<string, any>, i: number) => {
      if (!(typeof s.duration === "number" && s.duration > 0)) errs.push(`scene[${i}] duration 非法`);
      if (!(typeof s.start === "number" && typeof s.end === "number" && s.start < s.end)) errs.push(`scene[${i}] 时间区间非法`);
      if (!s.layoutId) errs.push(`scene[${i}] 缺 layoutId`);
    });
  }
  return errs;
}

/** 解析并校验 RenderPlan；非法则抛出带全部错误的异常。 */
export function parseRenderPlan(input: string | object): RenderPlan {
  const obj = typeof input === "string" ? JSON.parse(input) : input;
  const errs = validateRenderPlan(obj);
  if (errs.length) throw new Error("RenderPlan 校验失败：" + errs.join("；"));
  return obj as RenderPlan;
}

/** 序列化为带缩进的 JSON 字符串（复现 / 迁移用）。 */
export function serializeRenderPlan(plan: RenderPlan): string {
  return JSON.stringify(plan, null, 2);
}
