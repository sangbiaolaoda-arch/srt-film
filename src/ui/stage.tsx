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
import { MOTION_BY_ID } from "../motion/catalog";
import type { Shot } from "../core/shot";
import { STAGE_FPS, STAGE_H, STAGE_W, renderFrame } from "../render/frame";

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

const ENTER_TRANSITIONS = [
  "m-cross-dissolve", "m-push-left", "m-wipe-panel", "m-zoom-through", "m-split-open",
  "m-wipe-diagonal", "m-sweep-light", "m-mask-circle",
];
const EXIT_MOTIONS = [
  "m-fade-out", "m-slide-out-down", "m-mask-close", "m-scale-out", "m-sink",
  "m-blur-out", "m-shrink-away", "m-slide-out-left", "m-flip-out", "m-dissolve-up",
];

/** 离屏的版式容器：不可见，但保留布局（GSAP 需要能算盒子）。 */
function Stage({ shots }: { shots: Shot[] }): JSX.Element {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} width={STAGE_W} height={STAGE_H} data-stage="">
      {shots.map((shot, i) => (
        <g key={i} data-layer={i} data-shot={shot.layout.id}>
          {/* 机位运动作用于这个内层容器：与转场/出场（作用于外层 data-layer）不抢同一 transform */}
          <g data-cam={i}>
            <LayoutLayer layout={shot.layout} content={shot.content} />
            <BeatMark beat={shot.content.beat} style={shot.layout.style} />
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

  shots.forEach((shot, i) => {
    const layer = layers[i]!;
    const dur = Math.max(shot.end - shot.start, 1.2);
    // 与上一拍出场交叠 0.25s → 交叉溶解，无黑场
    const at = i === 0 ? 0 : Math.max(tl.duration() - 0.25, 0);
    shot.tlStart = at;

    // 转场：导演指定优先，否则按轮转序列
    const transId = shot.layout.transition ?? ENTER_TRANSITIONS[i % ENTER_TRANSITIONS.length]!;
    const transDef = MOTION_BY_ID.get(transId) ?? MOTION_BY_ID.get(ENTER_TRANSITIONS[0]!)!;
    applyMotion(transDef.id, { tl, el: layer, at, dur: transDef.dur });

    const slots = Array.from(layer.querySelectorAll<SVGGElement>("[data-anim]"));
    slots.forEach((slotEl, k) => {
      const id = slotEl.getAttribute("data-motion") ?? shot.layout.enter[k % shot.layout.enter.length]!;
      const def = MOTION_BY_ID.get(id) ?? MOTION_BY_ID.get("m-fade-up")!;
      const slotAt = at + 0.08 * Math.min(k, 4);
      applyMotion(def.id, { tl, el: slotEl, at: slotAt, dur: def.dur });
      // 槽级强调（版式在槽上声明的 mx）：入场收尾后再触发，避免和入场抢同一个 transform 属性。
      const mxId = slotEl.getAttribute("data-mx");
      const mxDef = mxId ? MOTION_BY_ID.get(mxId) : undefined;
      if (mxDef) applyMotion(mxDef.id, { tl, el: slotEl, at: slotAt + def.dur + 0.12, dur: mxDef.dur });
    });

    if (shot.layout.emphasis) {
      const main = slots[0];
      const def = MOTION_BY_ID.get(shot.layout.emphasis);
      if (main && def) applyMotion(def.id, { tl, el: main, at: at + Math.min(0.75, dur / 3), dur: def.dur });
    }

    // 环境动效：贯穿整拍图层（传入拍长；ambient 实现保证总长不超过它）。
    // 此前传 Math.max(dur, ambDef.dur * 2) 配合 yoyo 往返会把 timeline 撑长，
    // 后续每拍的 tlStart 全部被推迟 —— 已随 ambient 实现一起修正。
    if (shot.layout.ambient) {
      const ambDef = MOTION_BY_ID.get(shot.layout.ambient);
      if (ambDef) applyMotion(ambDef.id, { tl, el: layer, at, dur });
    }

    // 机位运动：贯穿整拍的持续线性运动 —— 镜内 Δ 的来源（推／拉／摇／移）。
    // 摇／移会平出画面边界，所以带平移时把缩放下限抬到 1.06 兜底防露边。
    const cam = shot.layout.camera;
    if (cam) {
      const camEl = layer.querySelector("[data-cam]") ?? layer;
      const hasPan = (cam.xFrom ?? 0) !== (cam.xTo ?? 0) || (cam.yFrom ?? 0) !== (cam.yTo ?? 0);
      const floor = hasPan ? 1.06 : 1;
      const s0 = Math.max(cam.scaleFrom ?? floor, floor);
      const s1 = Math.max(cam.scaleTo ?? s0, floor);
      tl.fromTo(camEl, { scale: s0, x: cam.xFrom ?? 0, y: cam.yFrom ?? 0, svgOrigin: "640 360" },
        { scale: s1, x: cam.xTo ?? 0, y: cam.yTo ?? 0, duration: dur, ease: "none", immediateRender: false }, at);
    }

    const exitId = shot.layout.exit ?? EXIT_MOTIONS[i % EXIT_MOTIONS.length]!;
    const exitDef = MOTION_BY_ID.get(exitId) ?? MOTION_BY_ID.get("m-fade-out")!;
    applyMotion(exitDef.id, { tl, el: layer, at: at + Math.max(dur - exitDef.dur, 0.6), dur: exitDef.dur });
  });

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
