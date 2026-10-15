# srt-film 基线审计（Phase 0）

> 审计日期：2026-10-15 · 仓库 HEAD：`8d5598d`（本地 ahead 15，未推送）· 审计人：WorkBuddy
> 依据：`srt-film-project-plan.md` §1「基线审计输出」九项。本阶段不做大规模重构。

---

## 1. 当前可运行功能、入口和主要模块

| 能力 | 状态 | 证据 |
|---|---|---|
| SRT 粘贴/载入 → 规划 → 预览 | ✅ 可运行 | `npm run dev` → 填 `#srt-input` → `#btn-load`；e2e-export.mjs 全程走真实 UI |
| 分拍与镜头规划（语义分拍 + 导演覆写） | ✅ | `src/core/beats.ts` + `src/core/plan.ts` + `examples/*-overrides.json` |
| 版式自动挑选（v2 优先 + 旧库回退） | ✅ | `src/layouts/pick.ts`（组级帽 + 排名轮换 + requireFirst） |
| 播放/seek/进度跳转 | ✅ | `src/ui/stage.tsx`（GSAP 时间轴 + `__stage` 钩子） |
| 无音轨 MP4 导出 | ✅ | `src/export/mp4.ts`（WebCodecs + mp4-muxer） |
| 端到端验收工具 | ✅ | `tools/e2e-export.mjs`（dev server → 无头 UI → 导出 → ffprobe） |
| 逐帧 QA / 确定性 / 接触印相 | ✅ | `tools/qa-frames.mjs`（`npm run qa:frames` / `qa:det` / `qa:still`） |
| 门禁（动效冲突/数字溯源/宽度安全区） | ✅ 已修两处误报 | `src/core/plan.ts` 第三遍；commit `66a15bb` |

主要模块：`src/core`（srt/beats/trace/compose/content/plan/overrides/text/rng）、`src/layouts`（catalog 旧库 212 版式 + v2 满版 16 套 + kaojin/wangji 专属场景 + pick/render/decor）、`src/motion`（60 原语 + apply）、`src/render`（frame/effects/post）、`src/export`（mp4）、`src/ui`（main/stage）、`tools`（plan-dry/qa-frames/e2e-export/coverage-scan/style-sweep/v2-shots）。

## 2. SRT 数据流与镜头规划数据流

```
SRT 文本 → parseSRT（core/srt.ts，编码/序号/时间戳校验）
  → planBeats（core/beats.ts，语义分拍：合并过短、拆分过长、保留 cue 可追溯）
  → composeScenes（core/compose.ts，旁白 → BeatScene：headline/bullets/数字溯源）
  → plan（core/plan.ts 三遍：①内容+溯源校验 ②eligible 资格+组级帽选版 ③宽度门禁+used 直方图）
  → Stage 构建（ui/stage.tsx：每拍 GSAP layer + enter 池轮转 + camera + 转场）
  → renderFrame（render/frame.ts）→ canvas 播放 / VideoEncoder 导出
```

RenderContent 数字溯源：`extractNumbers`（阿拉伯 + 中文数字两层：序数/量纲）→ `NumToken{kind: measure|span|ordinal}`——图表版式只收 measure（「85%」与「十年」不会混入同一张对比条）。

## 3. 画面由什么渲染；预览与导出是否共享渲染逻辑

**结论：共享，且是强同源——浏览器里显示的画面本身就是导出函数的输出。**

- 事实来源 = DOM 中的 SVG 树（`stage.svg`，LayoutLayer/Board 组件产出）+ GSAP 时间轴状态 + shot 元数据。
- `renderFrame`（`src/render/frame.ts:77`）是唯一解释器：底色（跨拍交叠 0.25s 交叉溶解）→ poster 特效 `drawFx` → `rasterizeLayer`（可见层 SVG 序列化 → Image → drawImage）→ `applyPost` 后期。
- **播放**：`stage.tsx:196 paint()` 每 rAF 调 `renderFrame({ctx: 显示 canvas 1280×720})`。
- **导出**：`mp4.ts:49-61` `setAutoRender(false)` 后逐帧 `stage.seek(t)` + 同一个 `renderFrame({ctx: 离屏 canvas 1920×1080})` → `VideoFrame` → `VideoEncoder`。
- 探测证据（2026-10-15 `e2e-html-parity.mjs --probe`）：DOM 中 svg 位于 x=-20000 离屏序列化位，用户所见画面即 canvas——不存在「预览一套绘制逻辑、导出另一套」的结构。
- canvas 尺寸差（显示 1280×720 vs 导出 1920×1080）由 renderFrame 按 `ctx.canvas` 宽高自适应（归一化网格 + `fitW` 按可用宽算），e2e 导出 1920×1080 且抽帧盲评通过。

## 4. MP4 导出方式、依赖、失败方式、编码参数、音轨

| 项 | 值 |
|---|---|
| 路径 | WebCodecs `VideoEncoder`（avc1.420028，H.264 High@4.0，8 Mbps，30 fps）+ `mp4-muxer` 浏览器内封装 |
| 外部依赖 | **零**（无 ffmpeg、无 puppeteer；编码器与复用器都是浏览器内 API/库） |
| 帧时钟 | `t = f / STAGE_FPS` 整数帧（`mp4.ts:51`）——与 HyperFrames `floor(frame)/fps` 同构 |
| 分辨率/帧数 | 1920×1080；e2e-03：73.933s / 2218 帧 = 时长×30 精确 |
| **音轨** | **无音频流**（ffprobe 单 video 流验证：codec_type=video only） |
| 失败方式 | 编码器 error 回调即时抛出；导出中页面崩溃 → 半个 Blob 不会落盘（e2e 先取 blob 再写文件） |
| 已知限制 | `VideoEncoder` 需 Chrome/Edge 94+（Firefox 无）；导出期间停显示循环（`setAutoRender(false)`），UI 冻结属预期 |

## 5. 测试、逐帧 QA、基线快照与盲区

| 层 | 工具 | 覆盖 |
|---|---|---|
| 单元 | `npm test`（3 文件：core/layouts/motion 等，77+ 断言） | 解析/分拍/溯源/选版/动效目录/门禁 |
| 门禁 | plan-dry 8 语料全绿（`66a15bb` 后） | 动效元素级冲突 + custom 豁免安全区 + 数字资格 |
| 端到端 | `tools/e2e-export.mjs` | 03：14/14（连续 3 次同输入：e2e-03/e2e-03-fx/e2e-03-fx2 全部 2218 帧精确）；08：12/12 |
| 逐帧 QA | `qa-frames.mjs` | 静止帧/黑白帧/结构差/重复渲染差（determinism）/接触印相 |
| 视觉盲评 | `outputs/.../v2-印相.html`（44 张）、e2e 抽帧 17 张 | 用户盲评入口 |

盲区：① MP4 导出与浏览器原生 DOM 渲染的像素级对比（DOM SVG 为离屏序列化源，该对比对产品无决策价值，见 §3）；② image 图像组无版式；③ 特效层只覆盖 4/16 氛围板式（2026-10-14 挂载，升级项 A/B 待用户定）；④ 风格「实际差异」目前依赖人工印相，无自动量化。

## 6. 风格数量与实际差异（不按 ID 计数）

- v2 满版库 16 套：编辑风 10 组（statement/number/compare/chart/timeline/quote/list/process/bookend）+ 海报风 4 套（strata/dust/dark-word/duo）。构造规律五条（满版出血/单一图形主角/大衬线字/克制三色/小字注脚），与旧 catalog 212 版式的「槽位排版器」是两种构造方式——不是换色关系。
- 实际差异证据：03 语料 12 拍用 9 版式（strata 色带/bars 数据条/split-blocks 分屏/竖排定版/双圆对峙构图语法互异）；印相 44 张 + 成片抽帧 17 张经用户盲评（m-A~m-E 为基准）。
- 专属场景（kaojin 60s / wangji 20s）为一拍一幅手绘，与 v2 参数化板式并存，覆写点名进入。

## 7. 主要缺陷（按影响排序）

| # | 缺陷 | 影响 | 状态 |
|---|---|---|---|
| 1 | BEAT NN 母版角标 stage 母版无条件渲染（`stage.tsx:55`），`decor:false` 管不到——成片左下角挂角标 | 用户可见，成片不像成品 | 待定（改 stage.tsx 需用户确认） |
| 2 | v2 特效层仅 4/16（strata/dust/dark-word/duo），用户评「敷衍」 | 氛围拍有粒子，编辑风 8 拍纯排版 | 升级项 A（粒子扩编辑风）/B（BgKind 背景）待选 |
| 3 | `layout.emphasis` 全库无渲染消费点（死字段） | 代码卫生 | 已记待定，不删（保旧兼容） |
| 4 | 01/05 语料长句 headline 需人工覆写缩句（05-overrides 拍 11/12） | 自动规划对长句的处理上限 | 部分缓解（custom 豁免安全区），根治在 Phase 6 布局引擎 |
| 5 | 槽级 `m`×`mx` 同元素冲突无门禁（只有版式级 enter 冲突校验） | 潜在动效冲突漏网 | 待 Phase 7 |
| 6 | image 图像组板式未做 | 「文字/图像/图表」三层中图像层缺满版板式 | Phase 6 |

## 8. 可保留 / 需适配 / 确需替换

- **可直接保留**：SRT 解析与分拍、数字溯源（kind 分层）、GSAP 时间轴与 seek、renderFrame（同源解释器）、WebCodecs 导出（选型结论见 `renderer-decision.md`）、qa-frames/e2e-export、v2 满版库与 pick 选版器。
- **需适配**：Render Plan 字段扩充（Phase 3：claim/visualMetaphor/continuityIn/qaExpectations 等——扩展现有 Beat/Layout/Shot，不建平行结构）；风格 token 化（Phase 5）；布局约束引擎（Phase 6，替代拍头宽度人工覆写）。
- **确需替换**：无。现有架构满足「HTML 权威来源 + 无音轨 MP4」的硬约束，无架构性阻碍。

## 9. 审计运行的命令与原始结果

```bash
git log --oneline -3                      # 8d5598d / 4f0ddff / 66a15bb，工作树干净
npm run check                             # tsc 零错 + HTML 语法 + 3 测试文件全过
npx vite build                            # 5.48s 通过
for f in examples/*.srt; do plan-dry; done  # 8/8 语料门禁全绿（带各自 overrides）
node tools/e2e-export.mjs --srt examples/03-data-comparison.srt   # 14/14，2218 帧，64.6MB
node tools/e2e-export.mjs --srt examples/08-forgetting-20s.srt --ov examples/08-forgetting-20s.json  # 12/12，570 帧
ffprobe -show_entries stream=codec_type e2e-03-fx2.mp4   # 仅 video(h264) 一流，无音频
node tools/e2e-html-parity.mjs --probe    # canvasAttr 1280×720 / canvasRect 754×423 / svgRect x=-20000（离屏序列化源）
curl api.github.com/repos/heygen-com/hyperframes  # 63.9k★ TS Apache-2.0，producer = Chrome BeginFrame + FFmpeg，Node≥22
```

---

**Phase 0 结论：PASS。** 基线可在本机重复（dev server + 8 语料 + 3 次连续导出成功）；保留/适配/替换边界清晰；主要缺陷 6 项已排序并有归属阶段。进入 Phase 1（选型记录见 `renderer-decision.md`）。
