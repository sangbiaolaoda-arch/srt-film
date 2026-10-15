# srt-film 阶段进展

> 格式依据 srt-film-project-plan.md §9。只报告事实；FAIL/BLOCKED 不得标完成。

## Phase 0 — 保护现场与基线审计

状态：PASS
本阶段目标：确认当前系统真实情况，建立可比较基线。
代码与文档变更：新增 `docs/project/baseline-audit.md`（九项审计输出）；无源码改动。
执行命令：`git log --oneline -3`、`npm run check`、`npx vite build`、8 语料 `plan-dry`（带 overrides）、`e2e-export.mjs` ×03/×08、`ffprobe -show_entries stream=codec_type`、`e2e-html-parity.mjs --probe`、GitHub API 查证 HyperFrames。
测试结果：tsc 零错；3 测试文件全过；8/8 语料门禁全绿；e2e 03 连续 3 次 14/14（2218 帧）、08 12/12（570 帧）。
真实渲染证据：`outputs/20261014_e2e-gate-fix/work/e2e-03-fx2.mp4`（64.6MB）、抽帧 17 张、v2-印相 44 张。
输出文件验收：1920×1080 / 30 fps / 73.933s / 2218 帧 / **无音频流**（ffprobe 单 video 流）。
本阶段解决的问题：确认预览与导出共享同一 renderFrame（DOM SVG 为离屏序列化源，canvas 即显示即导出）；风格多样性有印相与成片证据（16 v2 + 212 旧库，两种构造方式）；6 项主要缺陷排序。
尚存缺陷：BEAT NN 母版角标进成片；特效层 4/16；emphasis 死字段；长句 headline 依赖人工覆写；image 组缺版式；槽级 m×mx 无门禁。
是否可以进入下一阶段：是。
下一阶段入口：Phase 1 选型（已完成，见下条）。

## Phase 1 — 最小 HTML → 无音轨 MP4 垂直切片 + 路线选型

状态：PASS
本阶段目标：证明最终产品核心技术路线成立；冻结导出路线。
代码与文档变更：新增 `docs/project/renderer-decision.md`；新增实验工具 `tools/e2e-html-parity.mjs`（probe 模式；逐帧模式因架构结论调整为留档）。
执行命令：`e2e-html-parity.mjs --probe`（canvasAttr 1280×720 / svgRect x=-20000 离屏序列化源）；HyperFrames GitHub API 查证（repo/readme/package.json ×3/docs/concepts/determinism.mdx）。
测试结果：同 Phase 0；选型七维度矩阵见 renderer-decision.md §2。
真实渲染证据：同 Phase 0（选型不产生新渲染）。
输出文件验收：同 Phase 0。
本阶段解决的问题：导出路线冻结为 WebCodecs + mp4-muxer——3 次连续导出成功、无音轨、整数帧时钟、播放/导出同源全部实证；HyperFrames（BeginFrame + FFmpeg）作为参照与升级选项留档，不引入。
尚存缺陷：半绘制帧/SVG 光栅化保真度无已发现问题，BeginFrame 升级选项留档待触发条件。
是否可以进入下一阶段：是。
下一阶段入口：Phase 2 — 固定产品行为与错误处理（.srt 文件上传 UI、SRT 验证用例集、导出取消/互斥/重试、产物清单）。

## Phase 2 — 固定产品行为与错误处理

状态：PASS
本阶段目标：让用户知道系统能做什么、失败时知道怎么处理；固定产品行为与错误处理。
代码与文档变更：
- 新增 `src/core/srt-validate.ts`：`validateSRT(source)` 返回 `{ok, cues, errors[], warnings[]}`，区分硬错误（阻塞规划）与软警告（可继续）；`decodeSrtBytes(bytes)` 做 BOM 感知解码（UTF-8/UTF-16LE/UTF-16BE），非 UTF 编码抛「不支持的编码」。
- `src/export/mp4.ts`：`exportMp4` 增加 `opts.signal?: AbortSignal`，每帧查 `aborted` 抛「已取消导出」；失败时显式 `encoder.close()` 释放资源。
- `src/ui/main.ts`：文件上传（`<input type=file>` + ArrayBuffer → `decodeSrtBytes` → 文本框并自动规划）；读取→分析→规划→预览→导出→验收 六步状态步进；校验 gating（errors 阻塞、warnings 提示不阻塞）；导出互斥锁（`exporting`）+ 取消（`AbortController`）+ 失败后按钮复位可重试；「保存工程 JSON」产出可复现附属物（SRT + 覆写 + 镜头计划 + 运行日志）；`report()` 支持 ok/err/warn 三态。
- `index.html` / `src/styles/main.css`：新增文件按钮、状态步进条、运行日志区、取消/保存按钮及样式。
- 新增 `tests/srt.test.ts`：10 个校验用例（合法 / 空 / 坏时间戳 / 重叠 / 乱序 / 极短 / 超长 / BOM / UTF-16 / 非 UTF 抛错）。
执行命令：`npx tsc --noEmit`、`npm run check`（tsc + HTML 门禁 lint + test-all）、`npm run build`、`e2e-export.mjs --srt examples/08-forgetting-20s.srt`（14/14 回归）、自写 `.tmp/phase2-ui-check.mjs` 浏览器交互验证（9/9）。
测试结果：tsc 零错；4 测试文件全过（含新增 10 用例）；`npm run check` 全绿；`npm run build` 成功（69 模块）。
真实渲染证据：`.tmp/e2e/phase2-regression.mp4`（19s / 1920×1080 / 570 帧 / 22.02MB / 0 黑 0 爆白）；`.tmp/phase2-ui-check.mjs` 浏览器验证 9/9（非法 SRT 不崩溃且分析步标 fail、合法 SRT 步进到 preview done、文件控件 accept=.srt、取消按钮初始隐藏）。
输出文件验收：导出 MP4 同 Phase 0 参数，无音轨；工程 JSON 可下载（含 SRT/覆写/镜头计划）。
本阶段解决的问题：非法输入（空/坏时间戳/重叠/乱序/极短/超长/非 UTF 编码）现在给出逐条明确错误且不崩溃；导出可被中途取消并干净释放资源、失败可重试、过程中不会重入；用户可见的生成进度与产物边界（MP4 为主、工程 JSON 为可复现附属物）。
尚存缺陷：BEAT NN 母版角标进成片；emphasis 死字段；槽级 m×mx 无门禁；image 组缺版式——这些属 Phase 3+ 的 Render Plan 与模块边界范围，本阶段不处理。
是否可以进入下一阶段：是。
下一阶段入口：Phase 3 — 统一 Render Plan 与模块边界（扩展现有 Beat/Layout/Slot/Shot 类型，Schema 校验与版本化，最小测试样例）。

## Phase 3 — 统一 Render Plan 与模块边界

状态：PASS
本阶段目标：建立所有模块共同遵守的数据协议，而不是让每个 Skill 直接写最终 HTML；做 Schema 校验与版本化。
代码与文档变更：
- 审计现状：项目已有跨模块共享的 `Cue`/`Beat`/`Shot`/`Layout`/`Slot`/`RenderContent` 类型，`plan()` 产出的 `Shot[]` 即每拍 ScenePlan 雏形——数据契约已存在，缺口是「顶层 RenderPlan 容器 + schema 版本 + 校验 + 序列化」。
- 新增 `src/core/render-plan.ts`：`RenderPlan`（schema/version/canvas/styleProfile/scenes/export/generatedAt）、`ScenePlan`（含 `sourceCueIds` 溯源）、`RENDER_PLAN_SCHEMA`/`RENDER_PLAN_VERSION=1`、`toRenderPlan(result, {srt})`、`validateRenderPlan(p): string[]`、`parseRenderPlan()`、`serializeRenderPlan()`。
- `src/core/shot.ts`：`Shot` 增 `cueIds?: number[]`（对应 §4 sourceCueIds）。
- `src/core/plan.ts`：`out.push` 补 `cueIds: beat.cues.map(c=>c.id)`。
- `src/ui/main.ts`：「保存工程 JSON」改为导出 schema 背书、可校验、可复现的 RenderPlan（替换原临时拼装对象）；保存 `lastPlan` 供导出。
- 新增 `tests/render-plan.test.ts`：8 个用例（生成/溯源/序列化往返/合法校验/缺 schema/版本不符/空 scenes/非法解析抛错）。
执行命令：`npx tsc --noEmit`、`npm run check`（tsc + HTML 门禁 + test-all）、`npm run build`。
测试结果：tsc 零错；5 测试文件全过（新增 render-plan 8 例 + srt 10 例）；`npm run build` 成功。
真实渲染证据：复用 Phase 2 的 e2e/UI 验证（RenderPlan 为纯数据契约，不改变画面；导出路径未触碰）。
输出文件验收：RenderPlan JSON 经 `parseRenderPlan` 往返一致，version=1、canvas 1920×1080×30fps、export.audio=false。
本阶段解决的问题：把「保存工程」从临时对象提升为带 schema 版本与字段校验的权威可复现产物；`sourceCueIds` 让每拍可追溯到 SRT cue；非法 RenderPlan 在解析时即被拦下并列出全部问题。
尚存缺陷：image 组仍无版式（§4 的 image/illustration 节点未落地，依赖后续视觉模块）；槽级 m×mx 动效门禁缺失；`layout.emphasis` 死字段待清理——属 Phase 6/7 范围，本阶段不处理。
是否可以进入下一阶段：是。
下一阶段入口：Phase 4 — 内容理解与叙事镜头规划（cue 聚合为语义段落、镜头 claim/隐喻/禁区/目的、五类字幕测试集）。

## Phase 4 — 内容理解与叙事镜头规划

状态：PASS
本阶段目标：避免机械地「一条字幕一个页面」，让每一拍都有明确目的、事实可溯源、不臆造。
代码与文档变更：
- `src/core/compose.ts`：新增 `NarrativeRole`（hook/definition/evidence/comparison/explanation/consequence/conclusion）；`BeatScene` 增 `narrativeRole/claim/forbidden/purpose/continuityIn/continuityOut`；`classifyRole(beat)` 确定性规则分类（问句/首拍→hook，结论词→conclusion，定义词→definition，因果词→consequence，含数字+对照词→comparison，含数字→evidence，其余→explanation）；`enrichNarrative(scenes)` 在全部拍就绪后统一补镜头承接（相邻拍共享数字→continuityIn/Out）；`composeScene` 填充叙事字段。
- `src/core/shot.ts`：`Shot` 增 `narrative?: { role, purpose, forbidden }`。
- `src/core/plan.ts`：第一遍改为先 `composeScenes(beats)` 再 `enrichNarrative` 统一跑（需看邻居），把 `narrative` 写入 Shot；`claim` 严格等于旁白原文，绝不编造。
- `src/core/render-plan.ts`：`ScenePlan` 增 `role/purpose/forbidden`，`toScene` 透传；`src/ui/main.ts` 拍列表展示每拍角色标签与设计目的；`src/styles/main.css` 增角色/目的样式。
- 新增 `tests/narrative.test.ts`：8 个角色分类 + 承接 + 五类题材（科普/历史/抽象/数据/情绪）每拍都有角色/目的且 claim 等同原文（不编造）。
执行命令：`npx tsc --noEmit`、`npm run check`、`npm run build`、`e2e-export.mjs --srt examples/08-forgetting-20s.srt`（14/14 回归）。
测试结果：tsc 零错；6 测试文件全过（新增 narrative 8+5 类）；build 成功；e2e 14/14。
真实渲染证据：复用 e2e 成片（叙事层为纯数据，不改变画面；导出路径未触碰）。
输出文件验收：同 Phase 2/3；RenderPlan 现含每拍 role/purpose/forbidden，可复现产物信息更全。
本阶段解决的问题：每拍从「一句台词」升级为「带角色/目的/禁区/承接的镜头规划」；事实与视觉隐喻严格分离（claim 恒为原文，forbidden 保守派生不臆造）；五类题材均能给出明确目的。
尚存缺陷：隐喻（visualMetaphor）未显式生成——因项目规则禁止编造旁白外数据，隐喻须由所选版式/角色保守派生，本阶段以 forbidden 守住底线；叙事层尚未参与版式挑选或转场决策（Phase 5/7 范围）。
是否可以进入下一阶段：是。
下一阶段入口：Phase 5 — 风格系统与视觉导演（编辑排版风/扁平矢量叙事风/图表动态图形风三套，跨镜头连续性令牌，同题对照）。

## Phase 5 — 风格系统与视觉导演（三系化）

状态：PASS
本阶段目标：把「编辑风 / 海报风」两系升级为**真实多风格**的 editorial（编辑排版风）/ flat-vector（扁平矢量叙事风）/ chart-motion（图表动态图形风）三系；风格与内容类型/版式组解耦；三套在构图语法、图形表现、运动气质上有可见差异；产出同一段 SRT 在三风格下的对照样片作为证据。
代码与文档变更：
- 新增 `src/styles/style-system.ts`：`StyleProfile` token 契约（具名色 paper/ink/accent/…/clay、字体族 fontDisplay/fontText/fontNum、图形语法 lineWidth/radius/density/motionPace/transitionBias/grid/axis/rounded/flat/monoNum/paperTexture、语义色 `sem`、Tone 调色板 `tone`）；`STYLE_PROFILES`/`PROFILE_ORDER`/`resolveProfile`（非法回退编辑风）/`profileLabel`。板与装饰/底色层只读 profile，不写死颜色。
- `src/render/post.ts`：`POST_POSTER` → `POST_FLATVECTOR` + 新增 `POST_CHARTMOTION`，新增 `postForStyle(style)` 分流。`src/render/frame.ts`：后期层改 `postForStyle(style)`，`fxAccentOf` 解析 profile 色键。
- `src/layouts/render.tsx`：删 `COLORS`/`COLORS_POSTER`，`colorsOf` 改读 `resolveProfile(style).tone`（唯一色源）；**字体 token 接入槽位渲染器**（headline→fontDisplay、正文/标签→fontText、bignum/num2/delta→fontNum），删本地 SERIF/SANS 常量；板调用传 `profile`；逐字拆字门控由 poster 改 flat-vector。
- `src/layouts/decor.tsx`：`poster` 分支改 `profile.paperTexture` 门控（仅编辑风纸纹+加号栅格，扁平/图表净底+暗角）。`wash.tsx`：新增 FLAT_RAMP/WHITE_RAMP 与 `washCfg(style)` 三系光照/暗角参数。`figures.tsx`：`PALETTE` 补 flat-vector/chart-motion 两键。
- `src/layouts/catalog.ts`：`P()` 版式 `style` 由 poster 改 flat-vector（`poster-*` 组名保留作扁平矢量组标识）。`pick.ts`：**修 planStyles 真 bug** —— 原实现只对补选循环做「配额+不相邻」，初始自动扁平集合不受约束，导致 01 语料出现 4 拍相邻扁平（36%>25%）；重写为「覆写/数据密集锁定 → 按配额与不相邻挑扁平重音，锚点优先」。`plan.ts`：**修风格灌入 bug** —— 无条件 `layout = {...layout, style: decision.style}`（原先仅覆写时灌，自动判定的图表风/扁平风拍会用错 profile 渲染）。
- `ui/main.ts`/`gallery/main.tsx`：三系计数与标签；`types.ts`/`kaojin.tsx`/`wangji.tsx`/`render-plan.ts` 注释三系化；`tools/plan-dry.ts`/`style-sweep.ts` 三系报告。
执行命令：`npx tsc --noEmit`、`npx vitest run`、`npm run build`、`node tools/run-ts.mjs tools/three-style-sheet.tsx examples/01-explanatory-tech.srt dist/three-style-sheet.html`。
测试结果：tsc 零错；`tests/layouts.test.ts` 由 poster 模型翻转为三系（planStyles 占比/不相邻、decideStyle 映射、对比度遍历三系）；新增 `tests/style-system.test.ts` 12 例（token 契约/resolveProfile 兜底/三系 paper·ink 互异/图形语法差异/colorsOf 同源/postForStyle 分流/判定映射）；**123 测试全过**；`npm run build` 成功（71 模块）。
真实渲染证据：`dist/three-style-sheet.html`（768KB）—— 同一段 `01-explanatory-tech.srt` 11 拍，用导演覆写把全片分别钉死为三系各跑一遍完整规划链后逐拍渲染，三联并列。三系视觉签名分别实证：editorial=衬线×42 + 朱红 #c8401f + 纸白 #f2ede4；flat-vector=橙 #ff5a3c + 墨蓝 #15233b；chart-motion=橙 #ff6a00 + 等宽 JetBrains Mono（数字）+ 纯白底。三列构图语法/图形表现/运动气质可见差异。
输出文件验收：三系各 11 拍、风格不符 0 拍、门禁全通过；contact sheet 由同一个 `LayoutSVG` 渲染（预览/导出同源），非换色皮。
本阶段解决的问题：风格从「换底色」升级为「换 token 全套」（色/字/形/动效/转场/后期）；修复 planStyles 相邻扁平越界与 plan.ts 风格未灌入两个真 bug；字体 token 从「仅 v2 板消费 fontDisplay」补全为槽位渲染器全量消费。
尚存缺陷：`charts.tsx` 图表内部数字标签未消费 profile 等宽字体（chart-motion 的 mono 签名在 chart 组版式上被稀释，仅 number 组 bignum 走 fontNum）；v2 池暂无 chart-motion 专属板（图表风拍回落旧 catalog chart/number 组）——留待后续视觉模块补满。
是否可以进入下一阶段：是。
下一阶段入口：Phase 7 — 运动、镜头与转场系统（主运动可说明性、跨镜头连续性字段进渲染、转场库与 transitionBias 联动）；image 组版式与 chart-motion 专属 v2 板作为视觉对象模块扩充择机插入。

## Phase 6 — 视觉对象模块与布局/约束引擎（第一刀）

状态：PASS
本阶段目标：按主计划 Phase 6 开工 —— 数据图表模块消费风格 token（补 Phase 5 遗留的 chart-motion 等宽签名稀释）；建立布局约束引擎第一刀（槽位边界/实体重叠/文字装载量），让「换文案不溢出不越界」成为可执行门禁而非口头承诺。
代码与文档变更：
- `src/layouts/charts.tsx`：删 INK/ACCENT/SOFT/SOFT2 硬编码，`ChartProps` 增 `profile: StyleProfile`（唯一调用方 render.tsx 传 `resolveProfile`）；**修真 bug** —— barV/barH/barGroup/scatter/histogram 对 content.numbers 原始值（如 120）直接乘槽高导致严重出界，新增 `scale()` min-max 归一；图表风（`p.axis`）在比例语义直白的图（line-up/down、bar-v、bar-h、area、histogram）加坐标轴 + 三档真实值刻度 + 柱值标签（`fontNum` 等宽）；极坐标与累积/变换类图不标数字（避免误导）。
- 新增 `src/layouts/constraints.ts`：布局约束检查器（纯函数）—— `slotBox` 网格数学与渲染器同源；①画布边界（硬错误）②实体槽重叠（告警；文字浮 panel 是设计不查）③文字装载量（boost 公式 + 高度钳制镜像 render.tsx；超 1.25× 硬错误、超 1× 告警）；custom 满版画面跳过。
- `src/core/text.ts`：`charWidth`/`wrapText`/`FONT_SIZE` 由 render.tsx 下沉（检查器与渲染器共用同一把尺子，防「门禁说放得下、渲染器放不下」的漂移）。
- `src/layouts/render.tsx`：**修真 bug（根因）** —— 默认文本分支加高度钳制（排完超槽高就缩字号重排，触底「基准字号一半且 ≥24px」为止）。原实现只对 ≤8 字短句按槽高钳制，9–16 字长句 + mega 字号会把末行排出槽外（干跑实证 9 个版式硬错误，全部修复）。
- `src/core/plan.ts`：第三遍版式定稿后（槽覆写之后）跑 `checkLayout` —— errors 进 `problems` 门禁；warnings 进 `PlanResult` 新可选字段（进 ui 调试行与 plan-dry 报告）。对应计划原文「约束冲突时…报告失败，不能静默覆盖」。
- `src/layouts/decor.tsx`：**接上 grid token 消费方** —— 图表风母版铺 40px 细网格 + 200px 粗网格（坐标纸语汇）。此前 `grid:true` 无任何消费方，图表风非图表拍只剩白底（签名稀释根因）。
- 新增 `tools/constraint-audit.tsx`（干跑工具）；`tests/constraints.test.ts`（20 例）+ `tests/charts.test.tsx`（12 例）。
执行命令：`npx tsc --noEmit`、`npx vitest run`、`npm run build`、`node tools/run-ts.mjs tools/constraint-audit.tsx`、6 语料 `plan-dry`（含强制 chart-motion/editorial 对照）、`three-style-sheet` 重生成。
测试结果：tsc 零错；**148 测试全过**（123 旧 + 25 新）；constraint-audit：212 个槽位版式硬错误 0 / 告警 0；6/6 语料门禁通过且零布局告警；build 成功。
真实渲染证据：`dist/three-style-sheet.html`（774KB，重生成）—— 三联对照新增图表风签名：测量网格（decor-grid 16 处）、等宽数字、白底，图表带轴与真实值刻度。editorial=衬线×42 + 朱红 #c8401f×25；flat-vector=#ff5a3c×19；chart-motion=#ff6a00×40。
输出文件验收：三系各 11 拍、风格不符 0 拍、门禁全通过。
本阶段解决的问题：图表模块从「硬编码编辑风色 + 原始值出界 + 无标签」修复为「token 驱动 + 归一化 + 图表风轴标签」；布局约束从无到有（边界/重叠/装载量三类检查 + 门禁接线 + 干跑工具 + 25 测试）；修复渲染侧长句大字溢出根因（9 版式）与 charts 原始值出界根因；grid token 从死令牌变为母版签名。
尚存缺陷：v2 池暂无 chart-motion 专属板（图表风拍仍回落 catalog chart/number 组，靠母版网格补偿签名）；`density`/`transitionBias` 等 token 的细粒度消费（如网格疏密随 density）未做；wrapMarked（渲染）与 wrapText（检查器）的度量差依赖 1.25 倍阈值吸收，极端强调标题可能低估行数；跨镜头连续性令牌（continuityIn/Out 的形状/位置继承）尚未进渲染层。
是否可以进入下一阶段：是。
下一阶段入口：Phase 7 — 运动、镜头与转场系统（主运动可说明性、跨镜头连续性字段进渲染、转场库与 transitionBias 联动）；image 组版式与 chart-motion 专属 v2 板作为视觉对象模块扩充择机插入。

## Phase 6 — 视觉对象模块与布局/约束引擎（第二刀：图表风三件套 + 提取质量）

状态：PASS
本阶段目标：补上第一刀遗留的最大签名缺口 —— v2 满版池没有 chart-motion 板（覆写钉死图表风时 11 拍全落编辑风板，等于换色皮），grid/axis/fontNum 在满版通路无消费方；顺带修图表资格上游的数字提取质量（假度量值会让图表风选版失真）。
代码与文档变更：
- `src/layouts/v2.tsx`：新增图表风三件套（均声明 `style: "chart-motion"`，母版签名由板内自绘）：
  · `v2-data-giant`（number 组）：等宽巨号数字（fontNum）+ 数字下方测量尺（端 ticks + 尺寸线语汇，量的是数字自身宽度，不是假数据轴）+ 等宽图号 NO.拍号。
  · `v2-axis-columns`（chart 组）：竖柱 + 基线 + 左侧五档**真实值**刻度（max 由本拍度量值现算：0/¼/½/¾/max，无装饰假数）+ 柱顶 raw 原文 + 柱下印刷序号；`p.axis` 门控，编辑风 profile 下轴与刻度整组消失（token 降级而非硬编码）。
  · `v2-measure-note`（timeline 组）：文字板也带图表语法 —— FIG.拍号 + 四角定位标记（registration marks）+ 引线锚点 + 底部 11 等分通长尺。全列一致性不靠「偶尔有张图」。
  · `MeasGrid`：与 decor.tsx 图表风分支同参数的 40px 细 + 200px 粗网格。v2 板走 custom 通路不过 DecorLayer（render.tsx 对 custom 跳过 decor），网格由板内自绘；pattern id 带拍号（画廊/对照样片多拍共存同一棵 DOM）。
  · 两块数字板带 chart 资格槽（needs 按度量值数）+ headline 槽（hookCover 门禁认文字槽，数字板的主角是数字不是文字）。
- `src/layouts/pick.ts`：`preferredGroups(chart-motion)` 重构为与编辑风同构 —— 度量值≥2 才首选 chart、度量值≥1 才首选 number、文字拍 head=timeline。原实现无条件把 chart 推第一：0/1 数字拍在 v2 池没有合格 chart 板，`requireFirst` 直接判负，整拍掉回旧 catalog 槽位库（图表风列一半是槽位排版，母版语法断档；span 拍更掉到 sp-num-giant）。
- `src/core/trace.ts`：**修两个数字提取 bug**（图表资格的上游，01 语料实测）：
  · 「下一步/这一步/每层」的「一步/一层」漏进度量层（序列指代不是测量值）→ CN_QTY 加否定后视挡「第下上这同每另」前缀。拍 03「第一步…这一步叫 DNS 查询」因此被误选成数字巨号板。
  · 「TLS 1.3」「iOS 17」版本号进兜底层成度量值 → BARE 加两道闸：ASCII 字母+≤2 空格前缀、数字/小数点断点（同一个数的内部断点：1.3 的 3、17 的 7）。拍 08 坐标柱曾画出 1.3 vs 1 的量纲崩坏。
- `src/core/plan.ts`：`plan(srt, ovRaw = "")` —— 自然调用不再因缺参炸。
- 新增 `tools/frame-peek.tsx`（单帧 1:1 细看 + 无头浏览器截图验收）。
- 测试：新增 `tests/v2-chart-boards.test.tsx` 14 例（选版路由三类拍 + span 不成图 + 跨系隔离 + 图形语法 + 编辑风降级 + 确定性 + 覆写全片一致性 + 自动规划）；`tests/core.test.ts` 补 2 例提取回归（序列指代 / 版本号）。
执行命令：`npx tsc --noEmit`、`npx vitest run`、`npm run build`、`constraint-audit`、6 语料 `plan-dry`、`style-sweep`、`three-style-sheet` 重生成、frame-peek 截图（agent-browser）。
测试结果：tsc 零错；**163 测试全过**（148 旧 + 15 新）；constraint-audit：212 个槽位版式硬错误 0 / 告警 0；6/6 语料门禁通过且零告警；build 成功。
真实渲染证据：`dist/three-style-sheet.html`（重生成）+ frame-peek 截图逐帧核对 —— 图表风列现由三件套构成：文字拍=测量注记（FIG.01 + 定位标记 + 引线 + 通长尺）、一数字拍=数据巨号（等宽「120」+ 毫秒 + 尺寸线）、多度量拍=坐标柱（真实值刻度 0/30/60/90/120 + 柱顶原文）。母版网格签名 22 处、等宽字体 15 处、FIG 图号 9 处。修掉假度量后 01 语料自动规划正确地一拍图表风都不亮（数据不密集不硬凑）；03 数据对比语料 02/05 两拍自动命中坐标柱。
本阶段解决的问题：图表风从「v2 池无板 → 回落编辑风板换色」修复为「三件套专属构图 + 母版网格 + 等宽数字 + 坐标轴语言」；图表选版路由的 requireFirst 断档；数字提取的两类假度量（序列指代 / 版本号）。
尚存缺陷：`density` token 仍无消费方（网格疏密不随密度 变）；continuityIn/Out 未进渲染层；charts.tsx（catalog 图表槽）与 v2 图表板是两套图表实现，刻度风格统一但代码未合流；「往上再走一步」类动词+步仍算度量（可接受残留）。
是否可以进入下一阶段：是。
下一阶段入口：Phase 7 — 运动、镜头与转场系统（主运动可说明性、跨镜头连续性字段进渲染、转场库与 transitionBias 联动）；image 组版式作为视觉对象模块扩充择机插入。

## Phase 7 第一刀 — 统一时间轴与运动关系模型（2026-10-15）

**目标**：让画面变化有目的并形成跨镜头连续性。本刀先立「可验证的地基」——把运动编排从内联在播放器里（不可测、不可说明）抽成纯函数模型。

**改动**：
- 新增 `src/motion/schedule.ts`（Phase 7 核心模块）：
  - `buildMotionSchedule(shots) → MotionSchedule`：转场/入场池/强调/环境/机位/出场的 at/dur 全部声明式；时间轴口径与原实现逐分对齐（拍间 0.25s 交叠，running 精确复刻 GSAP `tl.duration()` 的最远结束点），接线后播放行为不变。
  - **主运动可说明**：优先级 机位（有位移才算，纯平移也算）> 入场 > 强调 > 显式「有意静止」；五问（任务/主体/时机/方向速度/结束状态）中任务直接取 Phase 4 `narrative.purpose`，不编造。
  - **transitionBias 首次消费**：slide→交叉溶解/左推/扫光（编辑风轻转场）；wipe→斜切/板擦（扁平风图形感）；mask→圆形遮罩/中缝（图表风掀图纸）；cut 池只有导演显式指定才出现（硬切有理由）；同系内按拍序轮换不雷同。
  - **motionPace 首次消费**：速度倍率语义，入场/强调/出场 `dur÷pace` 钳制 [0.3,2.5]s（扁平风 1.18 更快、图表风 0.9 更稳）；转场/机位/环境不缩放（保交叠稳定）。
  - **掩盖静止检查**：无主运动 + 全局氛围位移动效 → warning（不拦截：运动是品味问题，拦截是布局约束引擎职责，不越界）。
- `src/ui/stage.tsx` 接线：删 `ENTER_TRANSITIONS`/`EXIT_MOTIONS` 常量，编排块整体改为消费 MotionPlan；warnings 进 console。
- `src/layouts/v2.tsx`：坐标柱 y 轴刻度字号 18→20（1280 画布上 18px 偏小）。
- 新增 `tests/motion-schedule.test.ts` 19 例：确定性深相等 / 时间轴口径 / 全 catalog 每拍有主运动或有意静止 / 五问非空 / 三系转场分流 / 导演指定优先 / pace 排序 / 槽分配规则 / 掩盖静止检出 / catalog 动效 id 构建期门禁 / 01 语料端到端。

执行命令：`npx tsc --noEmit`、`npx vitest run`、`npm run build`、`three-style-sheet` 重生成。
测试结果：tsc 零错；**182 测试全过**（163 旧 + 19 新）；build 成功。
真实渲染证据：`dist/three-style-sheet.html` 重生成；坐标柱刻度 `font-size="20"` 11 处、`"18"` 清零（图表风列刻度放大生效）。
本阶段解决的问题：运动编排不可测/不可说明；transitionBias 与 motionPace 两个风格 token 无消费方；转场三系雷同（原固定轮转数组）。
尚存缺陷：跨镜头连续性（continuityIn/Out 的形状/位置/方向/颜色继承）未进渲染层；无头浏览器截图验收今日三次卡死（agent-browser 首启慢），刻度放大仅 DOM 级验证待补看；`density` token 仍无消费方。
## Phase 7 第二刀 — 跨镜头连续性进渲染层

- `src/core/shot.ts` + `src/core/plan.ts`：**接活 continuity 字段** —— enrichNarrative 算出的共享数字原先死在第一遍（prepared 不带 scene），现 Shot 带 `continuity?: string[]`。
- `src/core/compose.ts`：**continuity 规则从死到活**。原文匹配级在真实语料几乎为 0（每片最多 1 对）→ 数字承接改为**值级匹配**（跨单位：「120 毫秒」↔「120」），且只认度量值（measure）——「第三步」序号曾与上拍「3 次」值同级误配（01 语料实证，已修+回归测试）；新增**角色承接表** `HANDOFF`（问→答、概念→数据、数据→推论/结论、机制→数据、结果→总结），每支片开场拍必然命中（hook→explanation），连续性不再是死字段。
- 新增 `src/render/continuity.ts`：母版标记体系。`motifOf(shot)` 纯函数（形状/角落按叙事角色定、色调按是否带主数字定）；`continuityAt` 纯决策（有 continuity → ghost 全量继承上拍 motif：形状/位置/色调）；`drawContinuity` canvas 绘制（ghost 空心 + 自标记实面 + 虚线连接线，四角外框带不抢内容）。**跨角不变量**：HANDOFF 每个承接对都跨角（hook→explanation 曾同角 tl 致连接线零长度，qa-frames 实测后重排角落表，导出 HANDOFF 供测试断言）。
- `src/render/frame.ts` 接线：SVG 层之后、后期层之前调 drawContinuity —— 预览/导出同源，v2 满版板（custom，不过 DecorLayer）也覆盖。
- 颜色继承的字面含义：ghost 用**上一拍**风格档取色（跨风格继承不被重新染色）。
- `tools/plan-dry.ts`：新增连续性报告行（哪些拍继承什么）。
- 测试：新增 `tests/continuity.test.ts` 26 例（承接规则含序号误配回归 / motifOf 确定性与七形状互异 / 跨角不变量 / continuityAt 的 ghost 开关与 seek 确定性 / drawContinuity 记录型 ctx 桩断言取色与坐标与缩放 / plan 集成：01 语料 continuity 拍 >0 且 ghost 与上拍一致）。**208 测试全过**；tsc 零错；build 成功。
- 真实渲染证据（无头浏览器 + canvas 画素探针，非仅 DOM 级）：拍 1 自标记圆@tl；拍 2 ghost 空心圆@tl + 竖虚线连接线 + 自标记三角@bl；拍 3 ghost 空心三角@bl + 横虚线 + 自标记@br；连接线可辨度实测（x=36 列 52% 采样点暗于参照列、maxDiff 64，与虚线占空比 56% 吻合）；两次独立 qa-frames 运行同帧**逐字节相同**（seek 确定性实证）；页面零报错。证据样片 `dist/qa-continuity/contact-sheet.png`。
- 调试教训（已记入代码注释）：qa-frames `--shots 2.6` 曾一直落在拍 1（01 语料拍 1 长 7.52s），画素探针因此误判「连接线没画」—— 探时间点必须对照 `__stage.shots` 的 tlStart，不能按 SRT 秒数估。
本阶段解决的问题：continuity 字段半死（算了不传）；数字承接规则在真实语料零命中；跨镜头连续性无视觉消费方。
是否可以进入下一阶段：是。
下一阶段入口：Phase 7 第三刀 — 转场库细化（形状匹配/对位剪辑类转场原语）与逐帧 seek 一致性批量测试；`density` token 消费点（网格疏密/板内元素密度）择机插入。
