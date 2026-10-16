// 版式选择：为一拍挑一个版式。规则可解释、确定性、不重复上一拍。
// v3 新增两级：先决定风格（覆写优先），再在风格内挑版式。

import { LAYOUTS } from "./catalog";
import { V2_LAYOUTS } from "./v2";
import type { Group, Layout, RenderContent, Style } from "./types";
import type { PhotoId } from "../assets/photos";
import { displayWidth } from "../core/compose";

/** 度量值数量：token 分层缺失的老 content（测试 / 手工构造）按 numbers.length 老规矩。
 *  管线产出的 content 必带 numberTokens（见 core/content.ts），享受分层保护。 */
function measureCount(content: RenderContent): number {
  return content.numberTokens
    ? content.numberTokens.filter((t) => t.kind === "measure").length
    : content.numbers.length;
}

/** 资格门禁：图表版式必须有足够多可溯源数字；photo 版式必须有语义匹配的照片；
 * 否则该版式对本拍不合格。 */
export function eligible(layout: Layout, content: RenderContent, photo?: PhotoId): boolean {
  // photo 槽没钉死照片的版式，靠本拍的语义选图 —— 没命中标签就老实让位
  //（配错图比没图更伤可信度，见 assets/photos.ts pickPhoto）。
  if (layout.slots.some((sl) => sl.k === "photo" && !sl.photo) && !photo) return false;
  if (layout.needs !== undefined && content.numbers.length < layout.needs) return false;
  for (const slot of layout.slots) {
    if (slot.k !== "chart") continue;
    const need = slot.needs ?? layout.needs ?? 3;
    if (content.numbers.length < need) return false;
    // chart 的资格按**度量值**数算：span（十年/四十秒）与 ordinal（第七次）
    // 进对比条是量纲崩坏 —— numbers 池含全部 kind，图表门禁必须只认 measure。
    if (measureCount(content) < need) return false;
  }
  // 极短句（≤4 字宽，如「说」「他问」）只允许进「有大主槽」的版式：
  // 渲染器会把极短句放大到贴满主槽（见 render.tsx 短句放大），主槽太小的话
  // 放大上限被盒子高度卡死，结果是一个两字词缩在页角、四边大片留白 ——
  // 这是 02 语料印相里最难看的一类帧。出处：Adobe 海报指南 Step 3/4
  // （hook 必须占画面主体；「为一个词留出整个画面」）。
  if (displayWidth(content.headline) <= 4 && hookCover(layout) < 0.2) return false;
  return true;
}

/** 算主槽面积的槽种：只算真正承载「主角文字」的槽。 */
const HOOK_KINDS = new Set(["headline", "quote", "text", "bignum", "num2"]);

/** 主槽画面占比：版式里最大文字槽的 box 面积 / 整幅。 */
export function hookCover(layout: Layout): number {
  const cols = layout.cols ?? 12;
  const rows = layout.rows ?? 8;
  let best = 0;
  for (const s of layout.slots) {
    if (!HOOK_KINDS.has(s.k)) continue;
    best = Math.max(best, (s.box[2] / cols) * (s.box[3] / rows));
  }
  return best;
}

export interface StyleDecision {
  style: Style;
  /** 人类可读的判定理由（进调试面板） */
  reason: string;
  /** 海报风倾向分（越高越像动态海报） */
  score: number;
}

/** 金句/情绪信号：这类句子适合超大字号定住一拍。 */
const QUOTE_RE = /其实|终于|原来|才知道|记住|没有人|第一次|最后一次|一句话|说到底|不是.{0,6}而是|刚好相反/;
/** 设问信号。 */
const ASK_RE = /[?？]$|怎么|为什么|如何|什么是|有没有/;

/**
 * 海报风倾向打分（确定性，同输入必同输出）。
 *
 * 注意：这里**不能**用「长句」「要点多」这类恒定惩罚——旁白的 headline 天然是整句，
 * bullets 又是按标点切出来的，两者对每一拍都成立，恒定惩罚会让阈值永远达不到。
 * 所以只保留真正有区分度的信号，并且把「是不是真清单」按结构判断。
 */
export function styleScore(content: RenderContent, beatIndex: number, totalBeats: number): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];

  // 字号潜力：按**最长一行**算，不按整段——headline 天然是多行，按整段算会恒定「长句」。
  const lines = content.headline.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const maxLen = lines.reduce((m, l) => Math.max(m, displayWidth(l)), 0);
  if (maxLen > 0 && maxLen <= 10) { score += 2.2; notes.push("极短句"); }
  else if (maxLen <= 16) { score += 1.4; notes.push("短句"); }
  else if (maxLen <= 24) { score += 0.4; notes.push("中句"); }
  else { score -= 0.9; notes.push("长句"); }

  // 数据取向：有数字的拍更适合图表/数字焦点版式（编辑风的主场）
  if (content.numbers.length === 0) { score += 0.6; notes.push("无数据"); }
  if (content.numbers.length >= 2) { score -= 0.9; notes.push("数字密集"); }

  // 真正的清单式旁白（并列短名词堆叠）才降权——不是「有 bullets」就算
  const listy = content.bullets.length >= 4 && content.bullets.every((b) => displayWidth(b) <= 8);
  if (listy) { score -= 0.8; notes.push("清单式"); }

  if (ASK_RE.test(content.headline)) { score += 0.9; notes.push("设问"); }
  if (QUOTE_RE.test(content.headline)) { score += 0.7; notes.push("金句"); }
  if (beatIndex === 0) { score += 1.0; notes.push("开场"); }
  if (totalBeats > 2 && beatIndex === totalBeats - 1) { score += 1.0; notes.push("定版"); }

  return { score: +score.toFixed(2), notes };
}

/** 单拍判定（阈值法，供测试与逐拍推导使用）。 */
export function decideStyle(
  content: RenderContent,
  beatIndex: number,
  totalBeats: number,
  override?: Style,
): StyleDecision {
  if (override) return { style: override, reason: "导演覆写", score: 0 };
  const { score, notes } = styleScore(content, beatIndex, totalBeats);
  // 数据密集（≥2 个可溯源度量值）→ 图表动态图形风；强调信号够 → 扁平矢量叙事风；兜底编辑。
  const mc = measureCount(content);
  if (mc >= 2) return { style: "chart-motion", reason: notes.join("／") + "／数据密集", score };
  if (score >= POSTER_MIN) return { style: "flat-vector", reason: notes.join("／") || "常规", score };
  return { style: "editorial", reason: notes.join("／") || "常规", score };
}

/** 自动升级为海报风的最低倾向分。低于它说明这一拍更适合编辑风，不硬凑。 */
export const POSTER_MIN = 1.2;

/** 海报风拍的配额：约每 6 拍一次（海报是重音，不是底色）。 */
function posterQuota(n: number): number {
  return Math.max(1, Math.min(4, Math.round(n * 0.16)));
}

/**
 * 全片风格规划：逐拍打分 → 覆写/数据密集锁定 → 按配额与「不相邻」挑扁平矢量重音。
 * 扁平矢量约每 6 拍一次（重音不是底色）；图表动态由数据驱动，不抢配额。
 * 覆写优先；自动兜底只在分数真的够高时才升级（不够就诚实留编辑风，不硬凑）。
 */
export function planStyles(
  contents: RenderContent[],
  overrides: (Style | undefined)[] = [],
): StyleDecision[] {
  const n = contents.length;
  // 逐拍初判：覆写优先；否则数据密集 → 图表动态；强调信号够 → 扁平矢量；兜底编辑。
  const scored: StyleDecision[] = contents.map((c, i) => {
    const ovr = overrides[i];
    if (ovr) return { style: ovr, reason: "导演覆写", score: 0 };
    return decideStyle(c, i, n);
  });

  // 锁定：导演覆写与数据密集（图表动态）都不参与扁平矢量配额与去重。
  const locked = (i: number) => overrides[i] !== undefined || scored[i]!.style === "chart-motion";
  // 覆写钉成扁平矢量的拍直接进集合：占配额，并作为相邻回避的已占位。
  const flat = new Set<number>();
  for (let i = 0; i < scored.length; i++) if (overrides[i] === "flat-vector") flat.add(i);

  // 候选：未锁定、分数够高；锚点（开场/定版）优先，其余按分数降序、同分按拍序。
  const anchors = new Set(n > 2 ? [0, n - 1] : [0]);
  const candidates = scored
    .map((d, i) => ({ i, score: d.score, anchor: anchors.has(i) }))
    .filter(({ i, score }) => !locked(i) && score >= POSTER_MIN)
    .sort((a, b) => Number(b.anchor) - Number(a.anchor) || b.score - a.score || a.i - b.i);

  // 配额 + 不相邻：填到配额为止，跳过与已选（含覆写）相邻的拍 —— 重音之间必须有呼吸。
  const quota = posterQuota(n);
  const adjacent = (i: number) => flat.has(i - 1) || flat.has(i + 1);
  for (const { i } of candidates) {
    if (flat.size >= quota) break;
    if (adjacent(i)) continue;
    flat.add(i);
  }

  scored.forEach((d, i) => {
    if (overrides[i] !== undefined) return;   // 导演覆写：风格已定
    if (d.style === "chart-motion") return;   // 数据密集：图表动态锁定
    if (flat.has(i)) {
      d.style = "flat-vector";
    } else {
      const demoted = d.score >= POSTER_MIN;  // 分数够但被配额/相邻规则让位
      d.style = "editorial";
      if (demoted) d.reason = "让位配额/相邻（编辑风）";
      else if (d.reason === "常规") d.reason = "常规（编辑风兜底）";
    }
  });
  return scored;
}

/** 内容信号 → 优先版式组（按序尝试）。有语义匹配的照片时把 image 组提到内容组之前：
 * 照片是稀缺资源（标签命中的拍不多），命中了就该优先用掉 —— 但受组级帽约束，
 * 达帽后沉回原序（见 pickFrom 的 photoFirst）。
 *
 * 只有编辑风会因照片改首选顺序：图表风是白底数据系、扁平矢量风是平涂色块构图，
 * 照片进这两系会破坏系内一致性（v2-chart-boards 的三件套测试钉的就是第一条）。 */
function preferredGroups(content: RenderContent, style: Style, photo?: PhotoId, photoFirst = false): Group[] {
  const text = content.headline;
  const out: Group[] = [];
  if (style === "flat-vector") {
    if (content.numbers.length >= 1) out.push("poster-geo", "poster-focus");
    if (/[?？]$|怎么|为什么|如何/.test(text)) out.push("poster-field");
    // 兜底把 poster-field 提前：氛围场（strata）是扁平矢量风的语言底座，
    // 排后会被「矢量拍本来就少」饿死。组级帽让 field 达 25% 自动沉底让位。
    out.push("poster-field", "poster-focus", "poster-nest", "poster-geo");
    return out;
  }
  if (style === "chart-motion") {
    // 与编辑风同构，但数字组只认**度量值**：span「十年」不是可画的量，图表风的
    // 数字板（data-giant）资格按度量值门禁 —— 头组若推 number 而池里唯一的 number
    // 板不合格，requireFirst 会判负、整拍掉回旧 catalog（span 拍实测掉到
    // sp-num-giant，把「十年」渲成光秃秃的「10」）。
    if (measureCount(content) >= 2) out.push("chart");
    if (measureCount(content) >= 1) out.push("number");
    out.push("timeline", "image", "bookend", "statement");
    return out;
  }
  if (/[?？]$|怎么|为什么|如何/.test(text)) out.push("quote", "statement");
  if (/因为|所以|于是|导致|结果/.test(text)) out.push("process");
  if (/不是|而是|相比|比起|反之|却/.test(text)) out.push("compare");
  // 口语旁白一句很少塞 3 个数字（数据对比语料实测 12 拍里只有 1 拍 nums≥3），
  // chart 门槛定 2 —— 两个度量值就是一组对比，满版数据条成立。
  // 只数度量值：「85%」+「十年」是量纲混搭，画进同一张对比条必崩（03 拍 5 实测）。
  if (measureCount(content) >= 2) out.push("chart");
  else if (content.numbers.length >= 1) out.push("number");
  if (content.bullets.length >= 3) out.push("list");
  // 照片拍：photoFirst 时提到**首位**（数据拍也让位 —— 「建立 TCP 连接」这拍照片
  // 比数字卡更贴切）；不提首位时排在内容组之后、尾序之前。
  if (photo) {
    if (photoFirst) out.unshift("image");
    else out.push("image");
  }
  out.push("statement", "timeline", "image", "bookend");
  return out;
}

/** 旗舰版式与普通版式交错插池：旗舰循环复用（同一旗舰重复出现至少隔一个池长），
 * 把旗舰命中率钉在约 50% —— 旗舰是画法套装移植的重设计版式，纯追加池尾会被取模饿死。 */
function interleaveFlagship(pool: Layout[]): Layout[] {
  const flag = pool.filter((l) => l.flagship);
  const rest = pool.filter((l) => !l.flagship);
  if (flag.length === 0 || rest.length === 0) return pool;
  const out: Layout[] = [];
  let i = 0;
  let j = 0;
  while (out.length < pool.length) {
    out.push(flag[i++ % flag.length]!);
    if (j < rest.length) out.push(rest[j++]!);
  }
  return out;
}

/** 选版的跨拍记忆：组级帽要知道本片已经用过哪些组、这支片多长。 */
export interface PickCtx {
  /** 本片已落版式的 group 计数（覆写指定的也计入——它占了构图配额） */
  used: Map<Group, number>;
  /** 本片总拍数 */
  total: number;
}

/** 组级帽：同组板式在一支片里的出镜上限（约 25%，短片保底 2 次）。
 * 数字/图表组没有帽时，「数字拍走组内轮转」会让 03 语料 8/12 拍全是巨号数字、
 * 04 长片 16/29 —— 满屏同一种主角比没有主角更糟。
 * 帽只做沉底不设闸门：达帽组让位未达帽组，数字仍在句子里
 * （quote/chapter 等板式照显示整句），只是不再独占画面。 */
function groupCap(total: number): number {
  return Math.max(2, Math.round(total * 0.25));
}

/** 确定性挑选：在指定池内、按拍序轮转优先组，组内避开上一拍用过的版式。
 * requireFirst：内容的第一优先组必须在本池内（如数字丰富拍首选 chart），
 * 否则返回 undefined 整拍让位 —— 防止「v2 没有图表组就降级画数字卡」这种隐性覆盖不足。
 * 池内找不到合格优先组时返回 undefined（调用方决定回退）。 */
function pickFrom(pool: Layout[], content: RenderContent, style: Style, prevId?: string, requireFirst = false, ctx?: PickCtx, photo?: PhotoId): Layout | undefined {
  if (pool.length === 0) return undefined;
  const ofStyle = pool.filter((l) => (l.style ?? "editorial") === style);
  // 需要 Semantics 选图的版式：没图就从池里拿掉 —— 不能等 usable 为空再回落原池，
  // 那条回落路会把「没图的 photo 版式」又放回来（photo 槽没有 fallback 画面）。
  const hasPhoto = (l: Layout) => photo !== undefined || !l.slots.some((sl) => sl.k === "photo" && !sl.photo);
  const pool0 = (ofStyle.length > 0 ? ofStyle : pool).filter(hasPhoto);
  const usable = pool0.filter((l) => eligible(l, content, photo));
  const base = usable.length > 0 ? usable : pool0;
  const cap = ctx ? groupCap(ctx.total) : Infinity;
  const usedOf = (g: Group) => ctx?.used.get(g) ?? 0;
  const capped = (g: Group) => usedOf(g) >= cap;
  // 照片是否提到首选首位：命中语义选图、image 组未达帽、且本池真有 image 组。
  // 「本池真有」是硬条件 —— v2 满版库没有 image 组，若不查就 photoFirst=true，
  // requireFirst 会永远判负、**每一拍都掉回旧 catalog**，等于把 v2 全废（实测
  // 01 语料 11 拍全掉进 sp-* 槽位库，版式多样性从 11 塌到 8）。
  const poolHasImage = base.some((l) => l.group === "image");
  const photoFirst = photo !== undefined && poolHasImage && !capped("image");
  const wanted = preferredGroups(content, style, photo, photoFirst);
  if (requireFirst && wanted.length > 0 && !base.some((l) => l.group === wanted[0]!)) return undefined;
  // 去重：preferredGroups 会重复推同一组（如 poster-focus 先因数字、后因兜底），
  // 排名表被后写覆盖会让优先级颠倒（geo 被推到 focus 后面）。
  const groups = [...new Set(wanted.filter((g) => base.some((l) => l.group === g)))];
  if (groups.length === 0) return undefined;
  // 排名轮换，不按组硬分区取模：单组单板式时（list→list-marks、bookend→chapter），
  // 组内取模会让该组一被轮中就原样复现 —— 02 语料 16 拍因此只看到 5 套板式。
  // 改为全池按组优先级排序后整池轮转：优先级变成次序而不是闸门，
  // 重复周期从「组内长度」拉到「池长」，首选组的板式仍排在轮转最前面。
  // 第三键「组已用次数」做帽内均摊：同优先级的组（如 statement 的 ink-line/vertical）
  // 按已用轮转，没用过的组先上 —— 05 语料 strata×0 就是这样被饿死的。
  const rank = new Map<Group, number>();
  groups.forEach((g, i) => rank.set(g, i));
  const ranked = [...base].sort(
    (a, b) =>
      Number(capped(a.group)) - Number(capped(b.group)) ||
      (rank.get(a.group) ?? 99) - (rank.get(b.group) ?? 99) ||
      usedOf(a.group) - usedOf(b.group) ||
      a.id.localeCompare(b.id),
  );
  // 数据拍（number/chart 首选）：数字主角是这一拍的内容主体（旁白里真有数量词），
  // 在首选组内轮转 —— 全池轮转会把 13 套池里的数字板式饿死
  // （02 语料一半拍有数量词，旧轮转下数字板式零命中）。
  // 但带帽：达帽后沉到全池排名轮换，数字拍让位给 quote/chapter 等句内显示。
  const head = groups[0]!;
  if ((head === "number" || head === "chart") && !capped(head)) {
    const headPool = interleaveFlagship(ranked.filter((l) => l.group === head && l.id !== prevId));
    if (headPool.length > 0) return headPool[(content.beat - 1) % headPool.length]!;
  }
  // 照片拍（缺陷 6）：语义选图命中的拍，image 组内轮转 —— 同数字板式的道理，
  // 全池轮转会让 200+ 版式池里的 4 套照片板几乎永远轮不中（实测命中 0）。
  // 命中了照片就优先用照片板（photo 槽的优先，矢量素材拼贴的让位）；帽照常生效。
  // 避重用 index 位移不缩池 —— 缩池会让 (beat-1)%len 整体漂移，轮转变成抓阄。
  if (head === "image" && photo && !capped("image")) {
    const pool2 = ranked.filter((l) => l.group === "image");
    const withPhoto = pool2.filter((l) => l.slots.some((sl) => sl.k === "photo"));
    const headPool = withPhoto.length > 0 ? withPhoto : pool2;
    let idx = (content.beat - 1) % headPool.length;
    if (headPool[idx]!.id === prevId && headPool.length > 1) idx = (idx + 1) % headPool.length;
    return headPool[idx]!;
  }
  // 其余拍：全池排名轮换。池长稳定（不因避重缩池），避重只做index 位移 ——
  // 缩池会让 (beat-1)%len 整体漂移，rank 0 的板式被随机饿死。
  const finalPool = interleaveFlagship(ranked);
  let idx = (content.beat - 1) % finalPool.length;
  if (finalPool[idx]!.id === prevId) idx = (idx + 1) % finalPool.length;
  return finalPool[idx]!;
}

/**
 * 默认选版入口：v2 满版构图池优先，挑不出合格优先组（如图表拍 v2 首批无 chart 组）
 * 才落回旧 catalog 槽位库。旧的 162 套保留为回退，不再是被修补的主场。
 * ctx 带本片已用组直方图（plan.ts 维护），组级帽靠它生效；不传则无帽（单拍挑选/测试）。
 *
 * 照片拍例外：**先**在 catalog 里挑 photo 版式。原因是 v2 满版库没有 image 组，
 * 而 v2 池几乎从不会挑不出合格首选组（实测 01 语料 11 拍全在 v2 里挑到）—— 于是
 * 4 套照片板永远轮不到，全库 97 拍只出2 拍图。照片是语义选图明确命中的稀缺资源，
 * 命中就该用掉，所以它绕过 v2 优先级直取 catalog。
 * 三重闸：只在编辑风（另两系画面语言不容照片）、image 组未达组级帽、且版式确有 photo 槽。
 */
export function pickLayout(content: RenderContent, style: Style, prevId?: string, ctx?: PickCtx, photo?: PhotoId): Layout {
  if (photo && style === "editorial") {
    const cap = ctx ? groupCap(ctx.total) : Infinity;
    if ((ctx?.used.get("image") ?? 0) < cap) {
      const withPhoto = LAYOUTS.filter(
        (l) => l.group === "image" && (l.style ?? "editorial") === "editorial" && l.slots.some((sl) => sl.k === "photo"),
      );
      const usables = withPhoto.filter((l) => eligible(l, content, photo));
      const base = usables.length > 0 ? usables : withPhoto;
      if (base.length > 0) {
        // 避重用index 位移不缩池 —— 缩池会让 (beat-1)%len 整体漂移，轮转变成抓阄。
        let idx = (content.beat - 1) % base.length;
        if (base[idx]!.id === prevId && base.length > 1) idx = (idx + 1) % base.length;
        return base[idx]!;
      }
    }
  }
  return pickFrom(V2_LAYOUTS, content, style, prevId, true, ctx, photo) ?? pickFrom(LAYOUTS, content, style, prevId, false, ctx, photo) ?? LAYOUTS[0]!;
}
