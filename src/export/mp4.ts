// MP4 导出：逐帧 seek 时间轴 → 走 renderFrame（与播放同一函数）→ WebCodecs 编码 → mp4-muxer。
// 与播放共用渲染路径，所以导出画面与你在页面里看到的一模一样。

import type { StageHandle } from "../ui/stage";
import { renderFrame } from "../render/frame";
import {
  avcCodecFor,
  resolveExport,
  type ExportSettings,
} from "./settings";

export type { ExportSettings };

/** 编码器队列上限：WebCodecs 的 encode 是异步的，队列本身没有上限 —— 不等它就等于
 *  把整段片子的帧堆在系统内存里（JS 堆看不出来，崩的是渲染进程）。实测 103s 长片
 *  导出到 ~2160/3096 帧时页面被撑崩：彼时 `performance.memory` 只有 21MB。 */
const ENCODE_QUEUE_LIMIT = 8;

/** 导出进度快照。逐帧渲染 + WebCodecs 编码都在主线程，长片导出期间界面完全静止，
 *  没有进度用户只能盯着一个「导出中…」猜是否卡住。 */
export interface ExportProgress {
  /** 已编码帧数（0..total） */
  frame: number;
  total: number;
  /** 本次导出已耗时（毫秒） */
  elapsedMs: number;
  /** 按已用时与完成比例线性外推的剩余毫秒数；frame=0 时为 undefined */
  etaMs?: number;
}

export async function exportMp4(
  stage: StageHandle,
  duration: number,
  opts?: { signal?: AbortSignal; onProgress?: (p: ExportProgress) => void } & Partial<ExportSettings>,
): Promise<Blob> {
  const signal = opts?.signal;
  const onProgress = opts?.onProgress;
  if (typeof VideoEncoder === "undefined") {
    throw new Error("当前浏览器不支持 WebCodecs，请使用 Chrome/Edge 110+");
  }
  const cfg = resolveExport(opts);
  const { width, height, fps, bitrate } = cfg;
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("无法创建 2D 画布");

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width, height },
    fastStart: "in-memory",
  });

  let encodeError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encodeError = new Error(`编码器错误：${e.message}`); },
  });
  encoder.configure({
    // codec 的 level 段随分辨率走（720p→3.1 / 1080p→4.0 / 1440p→5.0）：
    // 报低了 1080p 的 8160 宏块/帧会超出 Level 3.1 的 3600 上限，编码器直接拒绝配置。
    codec: avcCodecFor(width, height, fps),
    width,
    height,
    bitrate,
    framerate: fps,
  });

  const totalFrames = Math.ceil(duration * fps);
  const startedAt = performance.now();
  const resumeAt = stage.time();
  const wasPlaying = stage.playing();
  stage.pause();
  stage.setAutoRender(false); // 停掉显示循环，避免与导出抢时间轴

  try {
    for (let f = 0; f < totalFrames; f++) {
      if (signal?.aborted) throw new Error("已取消导出");
      if (encodeError) throw encodeError;
      const t = f / fps;
      stage.seek(t);
      await renderFrame({ ctx, svg: stage.svg, shots: stage.shots, t, frame: f });
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(t * 1e6),
        duration: Math.round(1e6 / fps),
      });
      encoder.encode(frame, { keyFrame: f % (fps * 2) === 0 });
      frame.close();
      // 背压：队列超上限就让出主线程等编码器取走。放在进度上报之前 —— 上报本身就是
      // 一次让出，先等队列再上报才不会把「等」的时间算进下一帧。
      while (encoder.encodeQueueSize > ENCODE_QUEUE_LIMIT && !encodeError) {
        await new Promise((r) => setTimeout(r));
      }
      // 让出主线程 + 上报进度。回调放在让出点之后：这里已经是唯一能安全写 DOM 的时机
      // （循环体其余部分是同步的），也保证节流到每 8 帧一次，不会被进度上报本身拖慢。
      if (f % 8 === 0) {
        await new Promise((r) => setTimeout(r));
        if (onProgress) {
          const elapsedMs = performance.now() - startedAt;
          const p: ExportProgress = { frame: f, total: totalFrames, elapsedMs };
          if (f > 0) p.etaMs = Math.round(elapsedMs * (totalFrames - f) / f);
          onProgress(p);
        }
      }
    }

    onProgress?.({ frame: totalFrames, total: totalFrames, elapsedMs: performance.now() - startedAt });
    await encoder.flush();
    if (encodeError) throw encodeError;
    muxer.finalize();
    try { encoder.close(); } catch { /* 已关闭 */ }
  } catch (e) {
    // 取消或失败：释放编码器，避免残留半截任务占资源
    try { encoder.close(); } catch { /* 已关闭 */ }
    throw e;
  } finally {
    stage.setAutoRender(true);
    stage.seek(resumeAt);
    if (wasPlaying) stage.play();
  }

  const { buffer } = muxer.target;
  return new Blob([buffer], { type: "video/mp4" });
}