// MP4 导出：逐帧 seek 时间轴 → 走 renderFrame（与播放同一函数）→ WebCodecs 编码 → mp4-muxer。
// 与播放共用渲染路径，所以导出画面与你在页面里看到的一模一样。

import type { StageHandle } from "../ui/stage";
import { STAGE_FPS, renderFrame } from "../render/frame";

export const EXPORT_W = 1920;
export const EXPORT_H = 1080;

export async function exportMp4(
  stage: StageHandle,
  duration: number,
  opts?: { signal?: AbortSignal },
): Promise<Blob> {
  const signal = opts?.signal;
  if (typeof VideoEncoder === "undefined") {
    throw new Error("当前浏览器不支持 WebCodecs，请使用 Chrome/Edge 110+");
  }
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");

  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_W;
  canvas.height = EXPORT_H;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("无法创建 2D 画布");

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: EXPORT_W, height: EXPORT_H },
    fastStart: "in-memory",
  });

  let encodeError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encodeError = new Error(`编码器错误：${e.message}`); },
  });
  encoder.configure({
    // 1920×1080 是 8160 宏块/帧，超出 Level 3.1 的 3600 上限 → 必须报 Level 4.0（0x28）。
    codec: "avc1.420028",
    width: EXPORT_W,
    height: EXPORT_H,
    bitrate: 8_000_000,
    framerate: STAGE_FPS,
  });

  const totalFrames = Math.ceil(duration * STAGE_FPS);
  const resumeAt = stage.time();
  const wasPlaying = stage.playing();
  stage.pause();
  stage.setAutoRender(false); // 停掉显示循环，避免与导出抢时间轴

  try {
    for (let f = 0; f < totalFrames; f++) {
      if (signal?.aborted) throw new Error("已取消导出");
      if (encodeError) throw encodeError;
      const t = f / STAGE_FPS;
      stage.seek(t);
      await renderFrame({ ctx, svg: stage.svg, shots: stage.shots, t, frame: f });
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(t * 1e6),
        duration: Math.round(1e6 / STAGE_FPS),
      });
      encoder.encode(frame, { keyFrame: f % (STAGE_FPS * 2) === 0 });
      frame.close();
      if (f % 8 === 0) await new Promise((r) => setTimeout(r)); // 让出主线程
    }

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
