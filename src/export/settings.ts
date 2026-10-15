// 导出档位设置：分辨率 / 帧率 / 码率，以及由它们派生的 H.264 level 与 codec 串。
//
// 为什么单独一个模块：`mp4.ts`（编码器）与 `core/render-plan.ts`（工程 JSON 记录）
// 各需要一份同样的「当前导出档」。用户能在面板上改档之后，两处必须同步 —— 否则会出现
// 「面板选的是 720p、保存的工程 JSON 还写着 1080p」这种分叉。所以事实只在这里定义一次，
// 两边都从这里取。
//
// 本模块是纯函数、无 DOM、无副作用：UI 面板的档位列表、编码参数、工程 JSON 记录共用一份。

export interface ExportSettings {
  width: number;
  height: number;
  fps: number;
  /** 视频码率（bps） */
  bitrate: number;
}

/** 历史默认（1080p30 8Mbps）—— 保持既有导出产物不变。 */
export const DEFAULT_EXPORT: ExportSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  bitrate: 8_000_000,
};

/** 面板可选分辨率（16:9，均为 2 的整数倍，与 1280×720 舞台坐标系同比例）。 */
export const EXPORT_RESOLUTIONS: ReadonlyArray<{ width: number; height: number; label: string }> = [
  { width: 1280, height: 720, label: "720p（1280×720）" },
  { width: 1920, height: 1080, label: "1080p（1920×1080）" },
  { width: 2560, height: 1440, label: "1440p（2560×1440）" },
];

/** 面板可选帧率。低于 24 会让 0.25s 交叠窗只剩 6 帧，观感开始劣化。 */
export const EXPORT_FPS_OPTIONS = [24, 25, 30, 60] as const;

/** 面板可选码率。 */
export const EXPORT_BITRATE_OPTIONS = [4, 8, 12, 16] as const;

/** 码率缺省值按像素数缩放：以「1080p = 8Mbps」为锚点（1080p 恰好落回 8Mbps，
 *  既有导出产物不变），1440p → 14Mbps、720p → 4Mbps。 */
export function defaultBitrate(width: number, height: number): number {
  const mbps = (8_000_000 * width * height) / (1920 * 1080);
  const m = Math.round(mbps / 1_000_000) * 1_000_000;
  return Math.min(40_000_000, Math.max(2_000_000, m));
}

/** H.264 各级别的宏块上限（ITU-T H.264 表 A-1）：
 *  MaxFS = 每帧宏块数，MaxMBPS = 每秒宏块数。一个宏块 = 16×16 像素。 */
const H264_LEVELS: ReadonlyArray<{ level: number; maxFs: number; maxMbps: number }> = [
  { level: 30, maxFs: 1620, maxMbps: 40500 },
  { level: 31, maxFs: 3600, maxMbps: 108000 },
  { level: 40, maxFs: 8192, maxMbps: 245760 },
  { level: 41, maxFs: 8192, maxMbps: 245760 },
  { level: 42, maxFs: 8704, maxMbps: 522240 },
  { level: 50, maxFs: 22080, maxMbps: 589824 },
  { level: 51, maxFs: 36864, maxMbps: 983040 },
];

function macroblocks(width: number, height: number): number {
  return Math.ceil(width / 16) * Math.ceil(height / 16);
}

/** 导出档 → 需要的最低 H.264 level。超 5.1 抛错（面板档位不会触发，
 *  公开 API 被塞进 4K120 这类参数时会）。 */
export function avcLevelFor(width: number, height: number, fps: number): number {
  const fs = macroblocks(width, height);
  const mbps = fs * fps;
  const hit = H264_LEVELS.find((l) => fs <= l.maxFs && mbps <= l.maxMbps);
  if (!hit) throw new Error(`${width}×${height}@${fps}fps 超出 H.264 Level 5.1 编码上限`);
  return hit.level;
}

/** 导出档 → WebCodecs 的 codec 串（avc1 + Baseline profile 0x42 + 约束字节 0x00 + level）。
 *  level 必须随分辨率走：1080p 是 8160 宏块/帧，超出 Level 3.1 的 3600 上限 → 报 4.0。 */
export function avcCodecFor(width: number, height: number, fps: number): string {
  return `avc1.4200${avcLevelFor(width, height, fps).toString(16).padStart(2, "0")}`;
}

/** level_idc 的可读写法（H.264 里 40 = Level 4.0，直接显示 40 会被读成「40 级」）。 */
export function avcLevelLabel(width: number, height: number, fps: number): string {
  return (avcLevelFor(width, height, fps) / 10).toFixed(1);
}

/** 把面板读到的部分设置补成完整档位：缺分辨率走默认，缺帧率走默认，
 *  缺码率按像素数派生（不是硬编码 8Mbps —— 720p 给 8Mbps 是浪费、1440p 给 8Mbps 明显发糊）。 */
export function resolveExport(partial?: {
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: number;
}): ExportSettings {
  const width = partial?.width ?? DEFAULT_EXPORT.width;
  const height = partial?.height ?? DEFAULT_EXPORT.height;
  return {
    width,
    height,
    fps: partial?.fps ?? DEFAULT_EXPORT.fps,
    bitrate: partial?.bitrate ?? defaultBitrate(width, height),
  };
}
