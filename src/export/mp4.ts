// MP4 导出：逐帧 seek 时间轴 → 走 renderFrame（与播放同一函数）→ 两种落盘方式：
//   ① WebCodecs 编码 → mp4-muxer（单段短片的 UI 直出路径，毫秒级响应）；
//   ② 帧序列模式：逐帧 POST 成 JPEG 给本机接收端，再由 ffmpeg(libx264) 后编码。
//      —— 专为「长片」设计。无头 Chromium 的 WebCodecs H.264 编码器偶发不报
//         decoderConfig / colorSpace，muxer 在 finalize 崩溃；帧序列模式完全绕开它，
//         渲染路径仍与播放、与 ① 完全一致（都走同一个 renderFrame 画布）。
//
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
 *  把整段片子的帧堆在系统内存里（JS 堆看不出来，崩的是渲染进程）。 */
const ENCODE_QUEUE_LIMIT = 8;

/** 导出进度快照。逐帧渲染 + 编码都在主线程，长片导出期间界面完全静止，
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

export interface ExportOpts extends Partial<ExportSettings> {
  signal?: AbortSignal;
  onProgress?: (p: ExportProgress) => void;
  /** 分段导出起点（秒）：每段从 startAt 起导出 duration 长 */
  startTime?: number;
  /** 帧序列模式：设置后逐帧 POST 成 JPEG 给本机接收端（由 ffmpeg 后编码），不走 WebCodecs。
   *  framesPostUrl 为接收端上传地址；framesDir 为帧文件落盘目录（接收端 ?to= 前缀）。 */
  framesPostUrl?: string;
  framesDir?: string;
  frameQuality?: number;
}

/**
 * 逐帧导出。返回 MP4 Blob（WebCodecs 模式）或空 Blob（帧序列模式，实际产物已在接收端落盘）。
 */
export async function exportMp4(
  stage: StageHandle,
  duration: number,
  opts?: ExportOpts,
): Promise<Blob> {
  const signal = opts?.signal;
  const onProgress = opts?.onProgress;
  const cfg = resolveExport(opts);
  const { width, height, fps } = cfg;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("无法创建 2D 画布");

  const totalFrames = Math.ceil(duration * fps);
  const startedAt = performance.now();
  const resumeAt = stage.time();
  const startAt = opts?.startTime ?? 0;
  const wasPlaying = stage.playing();
  stage.pause();
  stage.setAutoRender(false); // 停掉显示循环，避免与导出抢时间轴

  const report = (f: number) => {
    if (!onProgress) return;
    const elapsedMs = performance.now() - startedAt;
    const p: ExportProgress = { frame: f, total: totalFrames, elapsedMs };
    if (f > 0) p.etaMs = Math.round(elapsedMs * (totalFrames - f) / f);
    onProgress(p);
  };

  try {
    // —— 帧序列模式：绕开 WebCodecs，逐帧 POST 成 JPEG（ffmpeg 后编码）——
    if (opts?.framesPostUrl) {
      const dir = opts.framesDir ?? "frames";
      const quality = opts.frameQuality ?? 0.92;
      for (let f = 0; f < totalFrames; f++) {
        if (signal?.aborted) throw new Error("已取消导出");
        const t = startAt + f / fps;
        stage.seek(t);
        await renderFrame({ ctx, svg: stage.svg, shots: stage.shots, t, frame: f });
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas.toBlob 返回空"))), "image/jpeg", quality);
        });
        const to = `${dir}/frame-${String(f).padStart(6, "0")}.jpg`;
        const r = await fetch(`${opts.framesPostUrl}?to=${encodeURIComponent(to)}`, {
          method: "POST",
          body: blob,
          headers: { "content-type": "image/jpeg" },
        });
        if (!r.ok) throw new Error(`帧 ${f} 落盘失败：HTTP ${r.status}`);
        if (f % 8 === 0) {
          await new Promise((r) => setTimeout(r));
          report(f);
        }
      }
      report(totalFrames);
      return new Blob([new Uint8Array(0)], { type: "video/mp4" });
    }

    // —— WebCodecs 模式（单段短片 UI 直出）——
    if (typeof VideoEncoder === "undefined") {
      throw new Error("当前浏览器不支持 WebCodecs，请使用 Chrome/Edge 110+");
    }
    const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
    const { bitrate } = cfg;
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
      codec: avcCodecFor(width, height, fps),
      width,
      height,
      bitrate,
      framerate: fps,
    });

    for (let f = 0; f < totalFrames; f++) {
      if (signal?.aborted) throw new Error("已取消导出");
      if (encodeError) throw encodeError;
      const t = startAt + f / fps;
      stage.seek(t);
      await renderFrame({ ctx, svg: stage.svg, shots: stage.shots, t, frame: f });
      const bitmap = await createImageBitmap(canvas);
      const frame = new VideoFrame(bitmap, {
        timestamp: Math.round(t * 1e6),
        duration: Math.round(1e6 / fps),
      });
      encoder.encode(frame, { keyFrame: f % (fps * 2) === 0 });
      frame.close();
      bitmap.close();
      while (encoder.encodeQueueSize > ENCODE_QUEUE_LIMIT && !encodeError) {
        await new Promise((r) => setTimeout(r));
      }
      if (f % 8 === 0) {
        await new Promise((r) => setTimeout(r));
        report(f);
      }
    }
    report(totalFrames);
    await encoder.flush();
    if (encodeError) throw encodeError;
    muxer.finalize();
    try { encoder.close(); } catch { /* 已关闭 */ }
    const { buffer } = muxer.target;
    return new Blob([buffer], { type: "video/mp4" });
  } catch (e) {
    throw e;
  } finally {
    stage.setAutoRender(true);
    stage.seek(resumeAt);
    if (wasPlaying) stage.play();
  }
}
