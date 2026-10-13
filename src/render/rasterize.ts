// 光栅化：把离屏 SVG 里的某一层单独转成可绘制对象。
// GSAP 把 transform / opacity 写在元素属性上，序列化时自然带上 —— 所以「取当前帧」= 序列化。
// 只对「可见层」做光栅化（通常 1 层，交叉溶解期 2 层），把每帧开销压到最低。
//
// 为什么走 Image + objectURL：实测本机 Chromium 的 createImageBitmap(SVG blob) 一律
// 「The source image could not be decoded」（连最简 <text> 都失败），而 <img> 路径正常，
// 且画出来的 canvas 可读像素（未被污染），WebCodecs 导出不受影响。

const XMLNS = "http://www.w3.org/2000/svg";

/** 单层 → HTMLImageElement。失败返回 null（调用方负责降级）。 */
export async function rasterizeLayer(
  svg: SVGSVGElement,
  index: number,
  w: number,
  h: number,
): Promise<HTMLImageElement | null> {
  const layer = svg.querySelector(`[data-layer="${index}"]`);
  if (!layer) return null;
  const inner = new XMLSerializer().serializeToString(layer);
  // 包装层的 viewBox 必须沿用**舞台坐标系**，width/height 才跟着输出分辨率走。
  // 早先这里直接把 viewBox 写成输出尺寸 —— 输出恰好是舞台尺寸 1280×720 时看不出问题，
  // 一旦换分辨率（比如 1080p），图层坐标仍按 1280×720 排布，就会挤在左上角、右下一片空白。
  const box = svg.getAttribute("viewBox") ?? `0 0 ${w} ${h}`;
  const doc =
    `<svg xmlns="${XMLNS}" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `viewBox="${box}" width="${w}" height="${h}">${inner}</svg>`;
  const url = URL.createObjectURL(new Blob([doc], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.width = w;
    img.height = h;
    img.src = url;
    await img.decode();
    return img;
  } catch {
    return null;
  } finally {
    // 解码完成后即可释放；已加载的 Image 不受影响
    URL.revokeObjectURL(url);
  }
}

/** 读某一层当前的可见度（GSAP 的 autoAlpha 会同时写 opacity 与 visibility）。 */
export function layerOpacity(svg: SVGSVGElement, index: number): number {
  const layer = svg.querySelector<SVGGElement>(`[data-layer="${index}"]`);
  if (!layer) return 0;
  if (layer.style.visibility === "hidden") return 0;
  const raw = layer.style.opacity;
  if (raw === "") return 1;
  const v = Number.parseFloat(raw);
  return Number.isFinite(v) ? v : 1;
}
