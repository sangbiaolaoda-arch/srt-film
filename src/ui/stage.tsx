// 舞台（v3 单 canvas 架构）：
//   离屏 SVG  —— GSAP 驱动的「版式真源」，只作数据源，不进视口
//   可见 canvas —— 每帧把离屏 SVG 的光栅化结果 + canvas 特效 + 后期层合成上去
// 播放与导出调用同一个 renderFrame，所以两者画面必然一致。

import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import gsap from "gsap";
import { BeatMark, LayoutLayer } from "../layouts/render";
import { DecorLayer } from "../layouts/decor";
import { applyMotion } from "../motion/apply";
import { applyElementMoves } from "../motion/element-apply";
import { movesFor } from "../semantics/dispatch";
import { buildMotionSchedule, slotTweens } from "../motion/schedule";
import type { Shot } from "../core/shot";
import { STAGE_FPS, STAGE_H, STAGE_W, renderFrame } from "../render/frame";
import { moodForRole } from "../layouts/wash";

export type { Shot };

export interface StageHandle {
  canvas: HTMLCanvasElement;
  /** 离屏 SVG（GSAP 的时间轴作用在它上面） */
  svg: SVGSVGElement;
  shots: Shot[];
  duration: number;
  time(): number;
  seek(t: number): void;
  play(): void;
  pause(): void;
  playing(): boolean;
  onComplete(cb: () => void): void;
  /** 导出时关掉自动渲染，避免与导出循环抢时间轴 */
  setAutoRender(on: boolean): void;
  destroy(): void;
  /** 调试用：底层 timeline */
  __tl: gsap.core.Timeline;
}

/** 运动编排的全部决策在 motion/schedule.ts（纯函数、可测、确定性）。
 *  这里只做「翻译」：把 MotionPlan 逐条变成 GSAP timeline 调用。 */

/** 槽的叙事优先级（越小越先入场）：标题 > 副文/标注 > 列表 > 图形/结构。
 *  入场错峰按此排序分配序号，标题先落、图形最后到，制造叙事层次。 */
function slotPriority(kind: string | null): number {
  switch (kind) {
    case "headline": case "text": case "quote": case "subhead":
      return 0;
    case "kicker": case "label": case "badge": case "meta":
    case "attribution": case "source": case "caption":
    case "bignum": case "num2": case "unit": case "delta":
      return 1;
    case "bullets": case "listnum": case "checklist": case "pills": case "tags":
      return 2;
    default:
      return 3; // figure/chart/icon/asset/panel/rule/divider 等图形与结构件
  }
}

/** 离屏的版式容器：不可见，但保留布局（GSAP 需要能算盒子）。
 *  导出给测试用：decor:false 时拍号角标与装饰层都不该出现在这一层里
 *  （成片左下角挂母版标记是 baseline-audit 缺陷 1）。 */
export function Stage({ shots }: { shots: Shot[] }): JSX.Element {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} width={STAGE_W} height={STAGE_H} data-stage="">
      {shots.map((shot, i) => (
        <g key={i} data-layer={i} data-shot={shot.layout.id}>
          {/* 机位运动作用于这个内层容器：与转场/出场（作用于外层 data-layer）不抢同一 transform */}
          <g data-cam={i}>
            <LayoutLayer layout={shot.layout} content={shot.content} mood={moodForRole(shot.narrative?.role)} total={shots.length} />
            {/* 拍号角标跟 DecorLayer 同一个门控：decor:false 的定版式（暗底单图那种）
                成片左下角不该挂母版标记 —— LayoutSVG 里本来就受门控，舞台这条旁路渲染绕过了。 */}
            {shot.layout.decor !== false && (
              <BeatMark beat={shot.content.beat} style={shot.layout.style} total={shots.length} group={shot.layout.group} />
            )}
            {shot.layout.decor !== false && (
              <DecorLayer beat={shot.content.beat} total={shots.length} style={shot.layout.style} />
            )}
          </g>
        </g>
      ))}
    </svg>
  );
}

export function buildStage(root: HTMLElement, shots: Shot[]): StageHandle {
  root.innerHTML = "";

  // 可见层：单 canvas
  const canvas = document.createElement("canvas");
  canvas.width = STAGE_W;
  canvas.height = STAGE_H;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  root.appendChild(canvas);
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("无法创建 2D 画布");

  // 离屏层：SVG（移出视口，不用 display:none 以保留布局盒）
  const off = document.createElement("div");
  off.setAttribute("aria-hidden", "true");
  off.style.position = "fixed";
  off.style.left = "-20000px";
  off.style.top = "0";
  off.style.width = `${STAGE_W}px`;
  off.style.height = `${STAGE_H}px`;
  off.style.pointerEvents = "none";
  document.body.appendChild(off);
  const reactRoot: Root = createRoot(off);
  flushSync(() => {
    reactRoot.render(<Stage shots={shots} />);
  });
  const svg = off.querySelector("svg") as SVGSVGElement;
  const layers = Array.from(svg.querySelectorAll<SVGGElement>("[data-layer]"));
  layers.forEach((l) => gsap.set(l, { autoAlpha: 0 }));

  const tl = gsap.timeline({ paused: true });
  let onDone: () => void = () => {};
  tl.eventCallback("onComplete", () => onDone());

  // Phase 7：统一时间轴与运动关系模型。确定性（同 shots → 同 plan）在这里
  // 一次性构建完，舞台只翻译；warnings 是品味提示（全局动效掩盖静止之类），
  // 进控制台不拦截 —— 拦截运动是 Phase 6 布局约束引擎的职责，不越界。
  const { plans, warnings } = buildMotionSchedule(shots);
  for (const w of warnings) console.warn(`[motion] ${w.text}`);

  plans.forEach((plan, i) => {
    const shot = shots[i]!;
    const layer = layers[i]!;
    shot.tlStart = plan.at;
    // schedule 已按叙事角色裁决本拍机位；写回 shot 让 frame.ts（导出同源）读同一份。
    // 有意静止的拍 camera 为 undefined —— 下面机位分支跳过，画面靠入场动效制造镜内 Δ。
    shot.camera = plan.camera?.move;

    // 转场：作用于整拍图层（与出场同一个 transform 层，从属主运动）。
    // 落位参数先写成层 data 属性 —— apply.ts 的形状匹配/对位剪辑从上面读
    // 锚点与方向（schedule 纯函数派生，这里只做翻译）。
    const tm = plan.transition.match;
    if (tm) {
      layer.setAttribute("data-match-anchor", tm.anchor);
      if (tm.handoff) layer.setAttribute("data-handoff", tm.handoff);
    }
    applyMotion(plan.transition.motion, { tl, el: layer, at: plan.transition.at, dur: plan.transition.dur });

    // 槽位入场 / 槽级 mx / 拍级 emphasis：全部由 slotTweens 统一排期（见 schedule.ts 的注释）。
    // 这里只读 DOM 上声明的 intent（data-motion / data-mx）喂进去，不再自己算时间。
    const slots = Array.from(layer.querySelectorAll<SVGGElement>("[data-anim]"));
    // 组内子槽不吃槽位级 tween：它们的位置唯一来源是组的变换（方案 §3.3 第 2 条）。
    // 父子各拿一条 tween 就是「父子重复位移」—— 那正是反向夹具要抓的错。
    const freeSlots = slots.filter((el) => !el.closest("[data-group]"));
    // 叙事错峰：先按「叙事重要性」给槽排序（标题→副文→列表→图形/结构），
    // 再按排序后的序号分配错峰偏移 —— 标题先落、图形最后到，观众视线被带着走，
    // 不再是所有元素齐刷刷一起动。
    const ordered = freeSlots
      .map((el) => ({ el, kind: el.getAttribute("data-kind") }))
      .sort((a, b) => slotPriority(a.kind) - slotPriority(b.kind));
    ordered.forEach(({ el }, k) => {
      const tws = slotTweens(plan, k, { m: el.getAttribute("data-motion"), mx: el.getAttribute("data-mx") });
      for (const tw of tws) applyMotion(tw.motion, { tl, el, at: tw.at, dur: tw.dur });
    });

    // 组级运动（Phase 1/3 语义切片）：MovePlan 已是绝对时间，直接编译进同一条时间轴。
    // 组内子槽没有自己的 tween —— 组是唯一位移来源。派发键是 slice.kind。
    if (shot.semantic) {
      const moves = movesFor(shot.semantic, plan.at, plan.dur);
      const res = applyElementMoves({ tl, scope: layer, graph: shot.semantic.graph, moves });
      if (res.missingTargets.length > 0) {
        console.warn(`[motion] 拍 ${shot.content.beat}：元素图里的组在渲染层不存在（${res.missingTargets.join("、")}）—— 组级运动没有落点`);
      }
    }

    // 环境动效：贯穿整拍图层（schedule 保证总长不超出拍长）
    if (plan.ambient) {
      applyMotion(plan.ambient.motion, { tl, el: layer, at: plan.ambient.at, dur: plan.ambient.dur });
    }

    // 机位运动：贯穿整拍的缓动运动（推／拉）。已由 schedule 按角色裁决是否值得动，
    // 且幅度克制（≤1.05）。缓动曲线 power2.inOut 与 frame.ts 的 easeInOutQuad 逐帧一致，
    // 保证预览与导出同源。无平移时缩放下限为 1，不强行放大。
    const cam = shot.camera;
    if (cam) {
      const camEl = layer.querySelector("[data-cam]") ?? layer;
      const s0 = cam.scaleFrom ?? 1;
      const s1 = cam.scaleTo ?? s0;
      tl.fromTo(camEl, { scale: s0, x: cam.xFrom ?? 0, y: cam.yFrom ?? 0, svgOrigin: "640 360" },
        { scale: s1, x: cam.xTo ?? 0, y: cam.yTo ?? 0, duration: plan.dur, ease: "power2.inOut", immediateRender: false }, plan.at);
    }

    applyMotion(plan.exit.motion, { tl, el: layer, at: plan.exit.at, dur: plan.exit.dur });
  });

  // 时间轴必须覆盖到末拍的 SRT 结束点。各拍的 tween 不一定正好铺到拍尾
  // （入场错峰、出场提前都可能让最后一帧的 tween 早于 end 收掉），
  // tl.duration() 就会短于真实片长 —— 播放提前结束、导出按短时长编码，
  // 片尾整段被静默丢掉。加一条「什么都不改」的占位 tween 把时间轴拉到
  // 真实片长：seek 到那个区间时画面保持末拍静止帧，与 SRT 一致。
  const lastShot = shots[shots.length - 1];
  if (lastShot && lastShot.end > tl.duration()) {
    tl.set({}, {}, lastShot.end);
  }

  const duration = tl.duration();
  tl.time(0, false);

  let curTime = 0;
  let isPlaying = false;
  let autoRender = true;
  let destroyed = false;
  let dirty = true;
  let raf = 0;
  let last = performance.now();

  const step = async (): Promise<void> => {
    if (destroyed || !autoRender) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (isPlaying) {
      curTime += dt;
      if (curTime >= duration) {
        curTime = duration;
        isPlaying = false;
        tl.time(curTime, false);
        await paint();
        onDone();
        dirty = false;
        raf = requestAnimationFrame(() => void step());
        return;
      }
      dirty = true;
    }
    if (dirty) {
      tl.time(curTime, false);
      await paint();
      dirty = false;
    }
    raf = requestAnimationFrame(() => void step());
  };

  async function paint(): Promise<void> {
    if (!ctx) return;
    await renderFrame({ ctx, svg, shots, t: curTime, frame: Math.round(curTime * STAGE_FPS) });
  }

  raf = requestAnimationFrame(() => void step());

  return {
    canvas,
    svg,
    shots,
    duration,
    time: () => curTime,
    seek(t: number) {
      curTime = Math.min(Math.max(t, 0), duration);
      // 立即把时间轴推到该点：导出循环依赖这一点（它自己负责 renderFrame）
      tl.time(curTime, false);
      dirty = true;
    },
    play() {
      if (curTime >= duration - 1e-3) curTime = 0;
      isPlaying = true;
      last = performance.now();
      dirty = true;
    },
    pause() { isPlaying = false; },
    playing: () => isPlaying,
    onComplete(cb: () => void) { onDone = cb; },
    setAutoRender(on: boolean) { autoRender = on; },
    destroy() {
      destroyed = true;
      autoRender = false;
      cancelAnimationFrame(raf);
      tl.kill();
      reactRoot.unmount();
      off.remove();
      root.innerHTML = "";
    },
    __tl: tl,
  };
}
