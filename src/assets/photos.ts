// 真实照片素材层（baseline-audit 缺陷 6：文字/图像/图表三层里的图像层）。
//
// 为什么照片由 canvas 直画而不是进 SVG：rasterize.ts 把 SVG 序列化成 blob 再
// new Image() 加载 —— 浏览器有条硬规则「SVG 以 image 方式加载时不能引用任何
// 外部资源」（外链 <image href>、相对路径全部失效），真照片进不了序列化管线。
// 所以照片走 renderFrame 的 canvas 图像层（见 render/frame.ts），SVG 里只留
// 空占位组保住槽序号。
//
// 素材来源：ImageGen 生成（2026-10-15，用户批准），统一「低饱和暖灰 + 35mm 颗粒
// + 留白」的艺术方向，与三系底色（#f2ede4/#fbf7f0/#ffffff）不打架。

/** 语义选图用的标签。全部 ≥ 2 个汉字 —— 单字标签（「光」「纸」）会在旁白里误命中。 */
export type PhotoId =
  | "typing" | "server" | "city" | "paper" | "hourglass" | "neural" | "seedling" | "crowd";

export interface PhotoEntry {
  id: PhotoId;
  file: string;
  /** 画面内容（调试面板 / 无障碍备注用，不参与匹配） */
  alt: string;
  /** 命中即得分：旁白里出现这些词，这张图才有可能被选中 */
  tags: string[];
}

// 照片放 public/photos/ 而不是走 Vite 资产管线：它们是真实位图，导出时由
// renderFrame 直接 new Image() 加载画进 canvas —— 不进 SVG 序列化（rasterize.ts
// 的 blob 加载规则禁止 SVG 引用外部资源）。public/ 下的文件按原路径同源提供，
// dev 与 build 都是 /photos/<name>.jpg，不需要 import 取哈希 URL。
// （早先写成 `import x from "./photos/*.jpg"`：src/assets/photos/ 目录并不存在，
// vite build 直接 Could not resolve 失败。）
const photoFile = (name: string): string => `/photos/${name}.jpg`;

const typingUrl = photoFile("typing");
const serverUrl = photoFile("server");
const cityUrl = photoFile("city");
const paperUrl = photoFile("paper");
const hourglassUrl = photoFile("hourglass");
const neuralUrl = photoFile("neural");
const seedlingUrl = photoFile("seedling");
const crowdUrl = photoFile("crowd");

export const PHOTOS: PhotoEntry[] = [
  { id: "typing", file: typingUrl, alt: "暖光下敲键盘的手", tags: ["电脑", "键盘", "打字", "输入", "点击", "上网", "代码", "程序", "互联网", "浏览器", "鼠标"] },
  { id: "server", file: serverUrl, alt: "机房服务器走廊", tags: ["服务器", "机房", "数据", "网络", "云端", "存储", "传输", "带宽", "基础设施", "后台"] },
  { id: "city", file: cityUrl, alt: "黄昏行人天桥下的街道", tags: ["城市", "都市", "街道", "夜晚", "灯光", "流量", "规模", "交通", "世界", "全球"] },
  { id: "paper", file: paperUrl, alt: "晨光里的笔记本与钢笔", tags: ["笔记", "记录", "书写", "文档", "信件", "阅读", "手写", "草稿", "清单", "纸页", "笔尖", "钢笔"] },
  { id: "hourglass", file: hourglassUrl, alt: "逆光的沙漏", tags: ["时间", "等待", "沙漏", "时钟", "过程", "历史", "快慢", "瞬间", "十年", "倒数"] },
  { id: "neural", file: neuralUrl, alt: "光纤束交叉如神经", tags: ["大脑", "神经", "记忆", "思维", "学习", "遗忘", "连接", "想法", "意识", "联想"] },
  { id: "seedling", file: seedlingUrl, alt: "破土的幼苗", tags: ["生长", "增长", "种子", "幼苗", "未来", "变化", "积累", "自然", "开始", "养成"] },
  { id: "crowd", file: crowdUrl, alt: "逆光过马路的人群", tags: ["人群", "用户", "大众", "社会", "选择", "行为", "市场", "消费", "习惯", "多数"] },
];

export const PHOTO_BY_ID = new Map(PHOTOS.map((p) => [p.id, p]));

/**
 * 语义选图：旁白词与标签做字面匹配（不臆造 —— 没有命中的拍就老实不用照片，
 * 强行配一张「氛围图」比没有更糟）。确定性：同文本同拍号必出同结果。
 *
 * 打分：命中标签数；同分用拍号轮转（8 拍里不至于 6 拍同一张）；
 * 与上一拍不重复（观众对「每拍都换图」的期待高于「最贴的那张反复用」）。
 */
export function pickPhoto(text: string, beat: number, prev?: PhotoId): PhotoEntry | undefined {
  const scored = PHOTOS.map((p) => ({ p, score: p.tags.reduce((n, t) => n + (text.includes(t) ? 1 : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (a.p.id < b.p.id ? -1 : 1));
  if (scored.length === 0) return undefined;
  const pool = scored.map((x) => x.p);
  let idx = (Math.max(1, beat) - 1) % pool.length;
  if (pool[idx]!.id === prev && pool.length > 1) idx = (idx + 1) % pool.length;
  return pool[idx]!;
}

/* ── 加载器：renderFrame 每帧 await，缓存后零开销 ────────────────────────── */

const images = new Map<string, HTMLImageElement | null>();
const pending = new Map<string, Promise<HTMLImageElement | null>>();

/** 已加载的返回元素；没加载过返回 undefined；加载失败返回 null（调用方画降级底色）。 */
export function loadedPhoto(id: PhotoId): HTMLImageElement | null | undefined {
  return images.get(PHOTO_BY_ID.get(id)?.file ?? "");
}

/** 确保照片已解码。浏览器外（纯函数测试 / 干跑）永远返回 null —— 调用方按「无图」降级。 */
export async function ensurePhoto(id: PhotoId): Promise<HTMLImageElement | null> {
  const file = PHOTO_BY_ID.get(id)?.file;
  if (!file) return null;
  const hit = images.get(file);
  if (hit !== undefined) return hit;
  if (typeof document === "undefined") return null;
  let pr = pending.get(file);
  if (!pr) {
    pr = new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = file;
    }).then((img) => {
      images.set(file, img);
      pending.delete(file);
      return img;
    });
    pending.set(file, pr);
  }
  return pr;
}
