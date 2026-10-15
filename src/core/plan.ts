// 规划管线：SRT + 导演覆写 → 拍序列（含门禁问题）。
// 纯函数、无 DOM —— 浏览器（ui/main.ts）与干跑工具（tools/plan-dry.ts）共用这一份，
// 避免两处各写一遍规划逻辑后悄悄漂移。

import { parseSRT } from "./srt";
import { planBeats } from "./beats";
import { composeScenes, enrichNarrative, validateScene, displayHeadline, displayWidth, HEADLINE_MAX, type BeatScene } from "./compose";
import { buildContent } from "./content";
import { applyOverride, type OverrideMap } from "./overrides";
import { stripPunct } from "./text";
import type { Shot } from "./shot";
import { LAYOUT_BY_ID } from "../layouts/catalog";
import { eligible, pickLayout, planStyles } from "../layouts/pick";
import { checkLayout } from "../layouts/constraints";
import type { Group } from "../layouts/types";
import { resolveProfile } from "../styles/style-system";
import { MOTION_BY_ID, validateMotionSet } from "../motion/catalog";

export interface PlanResult {
  shots: Shot[];
  /** 门禁问题；非空则不应播放 */
  problems: string[];
  /** Phase 6 布局约束告警（实体重叠/文字贴边；不拦截播放，进调试信息） */
  warnings?: string[];
  /** 逐拍风格判定说明（进调试面板） */
  styles: string[];
}

/** 构建管线：返回拍计划与门禁问题（问题非空则不播放）。ovRaw 缺省视为无覆写。 */
export function plan(srt: string, ovRaw = ""): PlanResult {
  const ov: OverrideMap = ovRaw.trim() ? (JSON.parse(ovRaw) as OverrideMap) : {};
  const beats = planBeats(parseSRT(srt));
  const problems: string[] = [];
  const warnings: string[] = [];
  const styles: string[] = [];

  // 第一遍：把每拍旁白变成内容（并做溯源校验）。
  // 宽度安全区不在这里查：版式还没选，无从判断该拍最终是槽位版式还是 custom 满版画面 ——
  // 挪到第三遍版式确定后按 layout.custom 分流查（见下）。
  // 叙事层（role/purpose/forbidden/continuity）在全部拍就绪后统一跑 enrichNarrative，
  // 因为它要向前/后看邻居（共享数字 → 镜头承接）。
  const baseScenes = enrichNarrative(composeScenes(beats));
  const prepared = beats.map((beat, i) => {
    const ovr = ov[String(beat.index)];
    const scene: BeatScene = baseScenes[i]!;
    const applied = ovr ? applyOverride(scene, ovr) : scene;
    problems.push(...validateScene(applied, ovr?.source, true));

    const content = buildContent(applied, beat, false);
    if (ovr?.headline) content.headline = ovr.headline;
    if (ovr?.bigNumber) content.bignum = ovr.bigNumber;
    if (ovr?.left) content.left = ovr.left;
    if (ovr?.right) content.right = ovr.right;
    const narrative = { role: applied.narrativeRole, purpose: applied.purpose, forbidden: applied.forbidden };
    // continuity 必须在这里接住：enrichNarrative 在 baseScenes 上算好了共享数字，
    // 不往 prepared/shot 带的话这条数据就死在第一遍（渲染层无从消费）。
    return { beat, ovr, content, narrative, continuity: applied.continuityIn };
  });

  // 第二遍：全片定风格（覆写优先，自动兜底按配额+锚点选海报风拍）
  const decisions = planStyles(
    prepared.map((p) => p.content),
    prepared.map((p) => p.ovr?.style),
  );

  // 第三遍：风格内挑版式 + 资格/动效门禁
  const out: Shot[] = [];
  let prevLayout: string | undefined;
  // 组级帽的跨拍记忆：同组板式出镜封顶（见 pick.ts groupCap），
  // 覆写指定的版式也计数 —— 导演钉了的构图同样占这支片的构图配额。
  const used = new Map<Group, number>();
  const bump = (g: Group) => used.set(g, (used.get(g) ?? 0) + 1);

  prepared.forEach(({ beat, ovr, content, narrative, continuity }, i) => {
    const decision = decisions[i]!;
    // 版式来源优先级：内联完整版式（ovr.layout，如专属场景）> catalog 查表（ovr.layoutId）> 自动挑选
    let layout = ovr?.layout ?? (ovr?.layoutId ? LAYOUT_BY_ID.get(ovr.layoutId) : undefined);
    if (ovr?.layoutId && !ovr.layout && !layout) {
      problems.push(`拍 ${beat.index}：覆写的版式 id「${ovr.layoutId}」不存在`);
    }
    layout = layout ?? pickLayout(content, decision.style, prevLayout, { used, total: prepared.length });
    bump(layout.group);

    // 风格档灌进 layout：底色 / 图形调色板 / 特效路径全部由 layout.style 驱动。
    // decision.style 已是最终值（自动判定或导演覆写，见 decideStyle/planStyles），
    // 无条件同步 —— 否则自动判定的图表风/扁平风拍会用错 profile 渲染。
    layout = { ...layout, style: decision.style };

    // 动效签名同样按风格派生：板式显式声明优先，"none" 仍是显式关闭（wangji 专属场景靠它）。
    // 不派生的话，19 个 v2 板式里有 15 个一帧 canvas 动效都没有（编辑风 11 个全裸）——
    // fx 此前只写在四个海报套上，用户看到的「敷衍」就是这个。强度一并派生：
    // 编辑风 0.35（浮尘只做呼吸，不能抢排版）／图表风 0.5／扁平风 0.7。
    const prof = resolveProfile(decision.style);
    layout = {
      ...layout,
      fx: layout.fx ?? prof.fxBias,
      fxStrength: layout.fxStrength ?? prof.fxStrength,
    };

    // 槽级动效覆写：克隆一份版式，只改被点名的槽 —— 不能就地改 LAYOUT_BY_ID 里的原对象，
    // 否则同一版式被别的语料复用时会被这支片的动效污染。
    if (ovr?.animations) {
      const anims = ovr.animations;
      for (const [k, id] of Object.entries(anims)) {
        if (!MOTION_BY_ID.has(id)) problems.push(`拍 ${beat.index}：覆写的动效「${id}」不存在（槽 ${k}）`);
      }
      layout = {
        ...layout,
        slots: layout.slots.map((sl, k) => (anims[String(k)] ? { ...sl, m: anims[String(k)] } : sl)),
      };
    }

    // 槽级定义覆写（box/size/figure/tone…）：同上，克隆合并，不污染原版式。
    if (ovr?.slots) {
      const slotOv = ovr.slots;
      for (const k of Object.keys(slotOv)) {
        const idx = Number(k);
        if (!(idx >= 0 && idx < layout.slots.length)) {
          problems.push(`拍 ${beat.index}：槽覆写序号「${k}」越界（该版式共 ${layout.slots.length} 槽）`);
        }
      }
      layout = {
        ...layout,
        slots: layout.slots.map((sl, k) => (slotOv[String(k)] ? { ...sl, ...slotOv[String(k)] } : sl)),
      };
    }

    // Phase 6 布局约束（槽覆写之后跑 —— 覆写可能改 box/size）：越界与严重文字溢出
    // 是硬门禁（进 problems；不拦截等于静默丢失画面元素）；实体重叠/贴边进告警通道。
    // custom 满版画面（v2 板/专属场景）自己管构图与断行，不查。
    if (!layout.custom) {
      const lc = checkLayout(layout, content);
      problems.push(...lc.errors.map((e) => `拍 ${beat.index}：${e}`));
      if (lc.warnings.length) {
        warnings.push(...lc.warnings.map((w) => `拍 ${beat.index}：${w}`));
      }
    }

    prevLayout = layout.id;

    const realStyle = layout.style ?? "editorial";
    const styleTag = realStyle === "chart-motion" ? "图表" : realStyle === "flat-vector" ? "扁平" : "编辑";
    styles.push(
      `${String(beat.index).padStart(2, "0")} ${styleTag}（${ovr?.layoutId || ovr?.layout ? "覆写版式" : decision.reason}）`,
    );

    // 资格门禁：图表版式必须拿得到足够多的可溯源数字
    if (!eligible(layout, content)) {
      problems.push(`拍 ${beat.index}：版式「${layout.name}」需要更多可溯源数字，旁白里不够`);
    }
    // 宽度安全区只约束槽位版式：custom 满版画面（v2 / 专属场景）自己断行与自适应字号
    // （compose.validateScene 的 skipHeadlineWidth 即此意），槽位版式的宽句仍须拦。
    if (!layout.custom) {
      const h = stripPunct(displayHeadline(content.headline));
      if (displayWidth(h) > HEADLINE_MAX) {
        problems.push(`拍 ${beat.index}：headline「${h}」显示宽度 ${displayWidth(h)} 超出安全区（${HEADLINE_MAX}），需缩短或分拍`);
      }
    }
    // 动效门禁：版式自带的动效必须存在且可组合。
    // enter 池第 i 项分给第 i 个槽（不同元素），逐项单独成组；emphasis 无元素落点，单独成组。
    const groups = layout.enter.map((id) => [id]);
    if (layout.emphasis) groups.push([layout.emphasis]);
    problems.push(...validateMotionSet(groups).map((e) => `拍 ${beat.index}：${e}`));
    for (const id of [...layout.enter, ...(layout.emphasis ? [layout.emphasis] : [])]) {
      if (!MOTION_BY_ID.has(id)) problems.push(`拍 ${beat.index}：版式引用了未知动效 ${id}`);
    }

    out.push({ layout, content, start: beat.start, end: beat.end, cueIds: beat.cues.map((c) => c.id), narrative, continuity });
  });

  return { shots: out, problems, warnings, styles };
}
