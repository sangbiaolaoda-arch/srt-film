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

## Phase 7 第三刀 — 转场库细化（连续性感知）+ density 消费 + seek 一致性批量验收（2026-10-15 深夜）

- `src/motion/catalog.ts` + `src/motion/apply.ts`：转场 5→10。新增**形状匹配 `m-shape-match`**（新拍从上一拍母版标记角 0.55→1 放大展开，锚点读层 `data-match-anchor`）与**对位剪辑 `m-match-cut`**（1.06→1 近瞬时落位 + 上拍水平滑出时 24px 同侧对位位移，读 `data-handoff`）—— 真硬切在导出链（只认 transform/opacity）做不了，这两个是可导出近似里最接近的两档。catalog 总数 60→62。
- `src/motion/schedule.ts`：三系池各扩到 4 项（编辑 +match-cut / 扁平 +shape-match / 图表 +shape-match）；新增**连续性优先规则**——本拍 `continuity` 非空时转场改走 `CONTINUITY_TRANSITION`（图形系形状匹配、排版系对位剪辑），导演指定仍然优先；落位参数 `transition.match`（anchor=上一拍 motif 角 / handoff=上一拍出场方向）纯函数派生，seek 确定性的组成部分。`MOTION_PATH` 补两条。
- `src/ui/stage.tsx`：只做翻译——把 `plan.transition.match` 写成层 data 属性，apply.ts 读取。
- `src/layouts/decor.tsx`：**density token 从签名稀释到真消费**。装饰层几何参数全部由密度派生（细网格步长 40+(0.7−d)×60、粗网格=细×5、标尺格数 4+8d、角环数 1+⌈2d⌉）；图表风 0.7 锚定 Phase 6 标定值 40/200 原样不动（v2.tsx MeasGrid 硬编码同参数，两边不同步会撕裂母版签名），编辑风加号栅格 48→61（全系最疏），图表风标尺 8→10 格、角环 2→3 个。
- 测试：219 全过（+11：motion-schedule 7 例覆盖连续性转场三系分流/首拍不继承/导演优先/锚点=上拍标记角/handoff 只有水平滑出/池轮转也带锚点；layouts 4 例覆盖 decor 密度派生与扁平风不走网格分支）。
- 回归：tsc 零错；build 成功；plan-dry 6/6 门禁过；constraint-audit 212 版式 0 错误 0 告警；**e2e-export 03 语料 14/14**（73.93s / 2218 帧 / 无全黑爆白）。
- **逐帧 seek 一致性批量验收**（本刀主验收）：qa-frames `--determinism` 01 语料全 11 拍 × 3 采样点 = 33 帧，每帧同时刻渲染两次比原始分辨率像素——**33/33 差 0.000（逐字节相同）**，页面零报错，无黑屏/爆白。证据 `dist/qa-transition/`（report.md + contact-sheet.png + shots/ + repeat/）。
- 「6 镜头镜内 Δ<1.2」问号闭合（A/B 实证）：暂存本刀改动回 e41f6dc 旧码重建重跑同参数 qa-frames——判定集与 Δ 值逐位同级（拍 1、2、4、6、9、10 同样低于门槛，Δ 1.146/0.413/0.201/0.314/0.927/0.247 与旧码一致）。根因：这些拍的主运动是 7–9s 缓推（1.10→1.14）作用在文字为主的 v2 满版板上，缩到 32×18 后结构差低于按图形密集样片标定的 1.2 门槛；11/11 拍实测均有真实机位移主运动（cam=move）。属量法内容依赖性（qa-frames 文档已注明「行星」场 ROI Δ 1.97 的先例），非本刀回归。
- 踩坑记录：vite build 清空 dist 时对 `dist/qa-transition` 的 trash 被残留 chrome 句柄挡下（Permission denied）——QA 截图目录与 build 输出混在同一 dist 时会互相锁；解法是 build 到独立 outDir 再拷回，QA 目录留在原地。
本阶段解决的问题：转场库无连续性语汇（继承只发生在内容层）；density token 四轮无消费方；seek 一致性只有两点抽样、缺全片批量门禁。
是否可以进入下一阶段：是。
下一阶段入口：Phase 8 — 交付层（导出设置面板/多分辨率/帧率）；母版角标 BEAT NN 无条件渲染问题（baseline-audit 第 1 项）可择机插入。

## Phase 8 第一刀 — 交付层：导出设置面板 + 多分辨率/帧率（2026-10-15 深夜）

**目标**：让成片规格可选（三档分辨率 × 四档帧率 × 码率），并顺手修掉 baseline-audit 缺陷 1（BEAT NN 母版角标进成片）。

- `src/export/settings.ts`（新）：导出档位的**唯一事实来源**。此前 `EXPORT_W/H/FPS` 在 `mp4.ts` 与 `render-plan.ts` 各存一份 —— 用户一旦能改档，两处必然分叉（「面板选 720p、工程 JSON 还写着 1080p」）。现在两边都从这里取。
  - `avcLevelFor(w,h,fps)`：按 H.264 表 A-1 的 MaxFS/MaxMBPS 逐级匹配（720p→3.1 / 1080p→4.0 / 1440p@60→5.1），超 5.1 抛错。**这是必要修复不是锦上添花**：codec 串硬编码 `avc1.420028`，用户选 1440p 就会配到编码器拒绝的 level（不是降质，是导出直接失败）。
  - `avcLevelLabel`：level_idc 的可读写法（40 → “4.0”）。面板若显示 `28` 会被读成「28 级」。
  - `defaultBitrate(w,h)`：码率按像素数缩放，以「1080p = 8Mbps」为锚点（既有产物逐位不变），1440p→14Mbps、720p→4Mbps。
  - 档位常量 `EXPORT_RESOLUTIONS`（720p/1080p/1440p）、`EXPORT_FPS_OPTIONS`（24/25/30/60）、`EXPORT_BITRATE_OPTIONS`（4/8/12/16 Mbps）。
- `src/export/mp4.ts`：`exportMp4` 收 `opts.width/height/fps/bitrate`（缺省 = `DEFAULT_EXPORT`，既有行为不变）；`t = f/fps`、`frame = f`、`duration = 1e6/fps`、关键帧间隔 `fps*2` 全部按档位派生。
- `src/core/render-plan.ts`：`toRenderPlan` 收 `opts.export`，把档位写进 `canvas` 并新增 `export.bitrate` —— 保存的工程 JSON 与实际 MP4 是同一份参数，可复现。
- `index.html` + `src/ui/main.ts` + `src/styles/main.css`：新增「导出设置」面板（三个下拉 + 一行摘要）。摘要摊开实际参数含 H.264 Level，因为「超 level 会直接失败」这件事用户在点导出前必须知道。码率下拉首项是「自动（按分辨率）」——换分辨率时忘改码率是最容易犯的错（1440p 配 4Mbps 明显发糊）。
- `src/ui/stage.tsx`（缺陷 1 修复）：`<BeatMark>` 与 `<DecorLayer>` 同走 `layout.decor !== false` 门控。`LayoutSVG` 里本来就受门控，舞台这条旁路渲染绕过了它，导致 4 个暗底定版式的成片左下角挂母版角标。`Stage` 组件改为导出以便测试。
- `tools/e2e-export.mjs`：加 `--w/--h/--fps`，并新增一条断言「ffprobe 分辨率 = 请求档位」——面板选 720p 却导出 1080p 是「设置没接上」的典型症状。
- 测试：235 全过（+16：新 `tests/export-settings.test.ts` 14 例覆盖 level 表/码率派生/缺省补全/RenderPlan 记录一致性；`layouts.test.ts` +2 覆盖角标门控）。
- **回归与多档 e2e 验收（全部实跑）**：
  - tsc 零错；build 成功；plan-dry **6/6 语料**门禁过；constraint-audit 212 版式 0 错误 0 告警。
  - e2e 默认档 03 语料 **14/14**：73.93s / 2218 帧精确（= 时长×30，与改动前逐帧一致）。
  - e2e **720p@24** 08 语料 **15/15**：19.00s / **456 帧精确**（= 时长×24），ffprobe 分辨率 = 1280×720。
  - e2e **1440p@30** 08 语料 **15/15**：19.00s / **570 帧精确**，ffprobe 分辨率 = 2560×1440。三档均无全黑/爆白帧。
  - 两档非默认 MP4 抽 t=8s 帧目视：内容一致（同一时刻不同分辨率）、非空非糊。
  - qa-frames 批量 seek 一致性 01 语料 33/33 帧同时刻两次渲染逐字节相同、页面零报错（6 镜头 Δ<1.2 仍是上轮已 A/B 实证的存量判定）。
- 顺手核实的**存量**问题（非本刀引入，已 stash 旧码实测对照）：左栏 5 个按钮被挤成竖排文字（68/74/52/67/80px 宽 × 80px 高）。旧构建尺寸逐项相同，确认与本刀无关 —— 380px 栏宽放不下 5 个并排按钮，Phase 9 可顺手做响应式换行。
本阶段解决的问题：成片规格写死 1920×1080@30/8Mbps；H.264 level 硬编码（换分辨率即导出失败）；导出档位两处定义会分叉；BEAT NN 母版角标进成片。
是否可以进入下一阶段：是。
下一阶段入口：左栏按钮响应式换行（存量 UI 问题）；baseline-audit 缺陷 2（v2 特效层 4/16）与 6（image 组板式）待用户选方向；缺陷 5 的槽级 m×mx 自动门禁仍未做。

## Phase 8 第二刀 — 交付层收尾：按钮/拍列表排布 + 导出进度 + 工程 JSON 回读（2026-10-15 深夜）

**目标**：把「可复现产物」从半闭环补成闭环，顺带修上一轮实测暴露的两处 flex 排布缺陷。

- **两处 flex 排布缺陷（同一根因，先量后改）**：flex 子项默认可被压到内容宽度以下，中文逐字竖排。
  - `.actions`：上一轮实测 5 个按钮被压成 52~80px 宽 × 80px 高（已 stash 旧码确认是存量问题）。
  - `.beat-list`：本轮截图才发现，同一根因的另一处 —— 「遗忘，不是记忆的宽度。」被压成 30px 宽的单字列。
  - 改法一致：容器 `flex-wrap: wrap` + 子项 `white-space: nowrap` + `flex: 0 0 auto` / `flex: 1 1 40%`。实测按钮全部回落到 40px 高单行，拍标题列从 ~30px 恢复到 523~552px。
- `src/export/mp4.ts`：新增 `onProgress({frame,total,elapsedMs,etaMs})` 回调。**回调放在每 8 帧的让出点之后** —— 循环体其余部分是同步的，那里是唯一能安全写 DOM 的时机；节流到每 8 帧一次，不让进度上报本身拖慢编码。收尾再补报一次 100%。
- `src/ui/main.ts`：进度只驱动按钮文案（「导出中 42% · 剩余约 40 秒」），不逐帧写日志（74s 的片子会刷出几百行把面板淹掉）。新增 `fmtDur` 做时长格式化，不足 1 秒不显示以免闪「剩余约 0 秒」。
- **工程 JSON 回读（补可复现闭环）**：`parseRenderPlan`/`validateRenderPlan` 早已实现并有测试，但 UI 上只能存不能读。新增「载入工程 JSON」入口：
  - 回填 SRT 原文 + 导出档位（分辨率/帧率/码率），再走一次「载入并规划」。**不直接渲染存档里的 scenes** —— 规划是纯函数（同 SRT + 同覆写 → 同 shots），重规划等价于还原，还顺手把门禁与风格规划一起跑了。
  - 存档 scenes 用于**漂移比对**：逐拍比 layoutId + headline，不一致就如实报出「首个差异在第 N 拍 / 画面以本次复现为准」，不静默接受（工程可能是在规划逻辑改版之前存的）。
  - 校验失败时把 `parseRenderPlan` 拼出的**全部**问题摊给用户，不只说「格式错误」。
  - 分辨率不在面板档位内时保留当前选择并告警，不静默丢弃。
- 测试：239 全过（+4：`render-plan.test.ts` 新增「工程 JSON 回读闭环」组 —— 存读往返一致、档位变更后存档跟着变、拍数漂移可检出、同拍数但版式不同也算漂移）。
- **浏览器实测（无头，dist 构建）**：
  - 非法工程（schema 错 + version 9 + canvas 非法 + scenes 空）→ 报告列出**全部 4 条**问题。
  - 档位从 1440p@30/自动码率 → 回读工程 → 恢复为 **1280×720 / 24fps / 8Mbps / H.264 Level 3.1**，摘要同步刷新。
  - 漂移检测：存档 1 拍 vs 复现 5 拍 → 告警「存档 1 拍、复现 5 拍（首个差异在第 1 拍）」。
  - 导出进度：720p@24 跑满 456 帧，**58 次进度上报**，从 0 单调递增到 456/456，页面零报错。
  - 按钮 7 个（新增载入工程 JSON）全部 40px 高单行；拍标题列 523~552px。
- 回归：tsc 零错；**239 测试逐文件全过**（`tools/test-all.mjs`；注意 vitest 合并跑在本机会静默少跑 3 个文件，只显示 155/239 —— 用逐文件口径）；plan-dry 3 语料门禁过；constraint-audit 212 版式 0/0；**e2e 720p@24 15/15**（19.00s / 456 帧精确）。
本阶段解决的问题：按钮与拍列表中文竖排；74s 导出全程无进度反馈；工程 JSON 只能存不能读（可复现产物半闭环）。
是否可以进入下一阶段：是。
下一阶段入口：baseline-audit 缺陷 2（v2 特效层 4/16）与缺陷 6（image 组板式）待用户选方向；缺陷 5 槽级 m×mx 自动门禁仍未做。

## Phase 9 — 特效通道重建：三系签名动效 + 按风格派生（2026-10-15 深夜）

**目标**（用户经 grill-me 两问定方向）：缺陷 2 的**两个方向都做**（canvas 动效 + 背景），fx 分配方式选**按风格自动派生**。范围从「v2 19 板式里 4 个有特效」扩到「全部板式一律有与风格匹配的动效」。

### 根因（比 baseline-audit 写的严重得多）

baseline-audit 缺陷 2 记的是「v2 特效层仅 4/16」，实际审计发现的根因是：**整个 fx 通道自挂载以来在亮底上没有任何可见输出**。

- `particleField` / `glowPulse` / `polyhedron` / `nestedTunnel` 四个原语全部用 `globalCompositeOperation = "lighter"`（加光混合）。
- 三系底色 `#f2ede4`（编辑风米白）/ `#fbf7f0`（扁平风暖白）/ `#ffffff`（图表风纯白）**全是亮底**。`lighter` 的特性是 `result = src + dst`：
  - 叠深色 → 深色本就是低值，加上近白的底反而更亮 → **零增量**；
  - 叠近白 → 还是白 → **零增量**。
- 结论：不是「4/16 覆盖不足」，而是**50 个旧 `P()` 板（12 glow + 38 粒子）+ v2 四套板式的 fx 全部失效**。用户此前的「敷衍」评价由此得到解释——此前几次「修特效」都只调了 alpha/数量，在亮底上把 1.5px 的点从峰值 14 拉到 66，肉眼依旧无差。

### 关键设计判断

1. **「克制」的正确定义 = 大面积 + 低对比，不是小面积 + 高对比。** 实测：稀疏浮尘（1.5px 点、覆盖率 0.05%）峰值 66 仍肉眼无差；改成大面积低对比（掠光带覆盖两成画面、带内仅 8 级色差）立刻可见。这是选择原语的唯一依据。
2. **fx 层位置改正：从「SVG 之下」移到「内容之上、后期之下」。** 原位置是「背景层」，被 v2 满版板**完全遮住**（拍 1 `strata` 五条色带 1360×760 铺满，开/关像素差 **0.000**）。移到内容之上后，语义变成「镜头前的空气」，拍 1 差 0.000 → **2.892**。层级最终为：底色 → SVG → 连续性 → fx → 后期。`continuity.test.ts` 只测纯函数不测层级，所以移动安全。
3. **按风格派生而非逐板点名。** `StyleProfile` 增 `fxBias` + `fxStrength`，`plan.ts` 灌入；layout 显式声明优先，`"none"` 是显式关闭（保证 `wangji` 专属场景不受影响）。

### 三系各得一种签名动效

| 风格 | fxBias | fxStrength | 依据 |
|---|---|---|---|
| editorial（编辑风） | `paper-sheen` | 0.45 | 纸面掠光：斜向拉渐变带扫过，覆盖两成画面、带内 8 级色差。编辑风是素面料，掠光正好补「纯排版无氛围」 |
| flat-vector（扁平风） | `drift-motes` | 0.7 | 色粉颗粒缓漂，与扁平色块构图同源；自带粒子场的板式（`pf-vortex-center` 等）保留自己的 `particles-vortex` 不被覆盖 |
| chart-motion（图表风） | `grid-pulse` | 0.5 | 扫描带点亮横网格线（像老式 CRT/雷达扫过），**不与图表的读图冲突** |

### 代码改动

- `src/render/effects.ts`：`FxOpts` 增 `onLight: boolean`（带长注释解释三系底色全亮 + 旧通道失效）。四个旧原语按 `o.onLight ? "source-over" : "lighter"` 分支；亮底分支的 `glowPulse` 去掉 `rgba(255,250,235,…)` 近白、改 accent 渐变（`0.1*strength*fade` / 中间 `0.045`）。新增三个原语：
  - `driftMotes(ctx,o,count,strength)`：`source-over`，`mulberry32(o.seed ^ 0x51ed270b)`，位置是 `t` 的**纯函数**（`y = (((y0 - o.t*rise) % 1) + 1) % 1`、`x = (x0 + sin(o.t*0.32+phase)*sway) * o.w`）——浮尘用取模循环而非逐帧累加，确保 seek 可复现。
  - `gridPulse` **重写**：第一版是「交点脉冲」，实测运动量 0.010（等于没有）；收窄 band 到 0.06 仍 0.010。重写为「扫描带点亮横网格线」（`front = (-0.15 + p*1.3) * o.h`、`band = o.h*0.22`、`globalAlpha = (1-d)*(1-d)*0.55*fade*k` + 扫描头一条更亮的线），运动量 0.010 → **0.339**。
  - `paperSheen(ctx,o,strength)`：`createLinearGradient` 斜向带（`half = diag*0.14`、`cx = o.w*(-0.2+p*1.4)`），三档 stop `0 / 0.075*strength*fade / 0`，一次 `fillRect` 全画布。
- `src/render/frame.ts`：新增 `isLightPaper(hex)`（相对亮度 `(0.299r+0.587g+0.114b)/255 > 0.55`）；`drawFx` 传 `onLight`，switch 增三个新原语（`drift-motes` 数量 `Math.round(70 + p.density*240)`）；**`drawFx` 调用点从 SVG 之前移到 `drawContinuity` 之后**，注释重编号为 `// 2. SVG 层` → `// 2.5 跨镜头连续性层` → `// 3. canvas 特效层：画在内容之上、后期之下 ——「镜头前的空气」` → `// 4. 后期层`。
- `src/styles/style-system.ts`：`StyleProfile` 增 `fxBias: FxKind` / `fxStrength: number`（带「三系各有一种属于自己的动」注释）并给三系赋值。
- `src/layouts/types.ts`：`FxKind` 增 `"drift-motes" | "grid-pulse" | "paper-sheen"`；`fx?` 注释从「背景层」改为「前景层」。
- `src/core/plan.ts`：`import { resolveProfile }`，在 `layout.style = decision.style` 之后追加 `layout = { ...layout, fx: layout.fx ?? prof.fxBias, fxStrength: layout.fxStrength ?? prof.fxStrength }`（不派生的话 19 个 v2 板式里 15 个一帧 canvas 动效都没有）。
- `src/layouts/v2.tsx`：`steps` 补 `bg: "dots-fade"`（唯一无 bg 的编辑风板）。

### 验收（全部实跑）

- tsc 零错；**268 测试逐文件全过**（239 + 新增 29：`tests/effects.test.ts` 21 例用无 canvas 的「指令记录器」断言确定性/t 变化/seed 变化/收边/混合模式/强度压 alpha/数量，含 `paperSheen`/`gridPulse`（线不是点）/`onLight` 四例；`tests/fx-derive.test.ts` 8 例覆盖三系 `fxBias` 与大小关系、六拍语料全拍 `fx` 非空非 none、板式自带 fx 不被覆盖、内联 `fx:"none"` 不被打开、派生不污染 catalog 共享定义）。
- **fx A/B 12/12 全过**（新工具 `tools/fx-ab.mjs`）：静态均差 0.274–2.892、**纯 fx 层运动量 0.220–10.633**。证据 `.tmp/fx-ab-final/report.md`。
  - 判据 `ok = mean > 0.05 && motion > 0.1`；**动态度量必须是纯 fx 层运动量** `|(开(t1)−关(t1)) − (开(t2)−关(t2))|` —— 先减掉内容只留 fx 层，机位推近/入场动画全部抵消。直接比整帧 t1→t2 是错的：拍 8 机位推近让开/关两版都差 52.4，fx 贡献被淹没甚至出现负值（拍 10 为 −1.304、拍 11 为 −0.117）。
  - `vh` 阈值从 0.3 调到 0.1（拍 5 实测 0.220）——依据是「视觉上等于没有」的版本实测 0.010–0.02，与合格值差一个数量级。
- plan-dry **6/6** 语料门禁过；constraint-audit **212 版式 0 错误 0 告警**。
- **qa-frames 确定性 33/33 帧「重复 0.000」**，页面零报错，无全黑/爆白。
- **e2e 导出 14/14**：73.93s / **2218 帧精确**（与改动前逐帧一致），无全黑/爆白，全流程墙钟 **209 秒**（特效未拖慢编码）。
- 额外收获：01 语料那 6 个「镜内 Δ<1.2」的静止拍，Δ 值普遍上浮（拍 1：1.146→1.155、拍 2：0.413→0.566、拍 4：0.201→0.354、拍 9：0.927→0.953）——特效确实在给「纯排版」拍加画面变化。
- 1:1 画面目视（`.tmp/ph9-shot.mjs` 用 `canvas.toDataURL("image/png")` 导原分辨率；整页截图会把 1280×720 缩到几百像素、1.5px 的点直接消失）：图表风拍摄像带清晰可见且不干扰读图；编辑风掠光在素面板有效（16.1% 样本在动），在 `num-band` 深色块铺满的板上偏弱（符合预期，该板本就不空）。
- 三联风格对照样片重生：`node tools/run-ts.mjs tools/three-style-sheet.tsx examples/01-explanatory-tech.srt dist/three-style-sheet.html` → 11 拍 × 3 系，风格不符 0 拍。

### 诚实缩范围（未做）

- **`bgBias` 未实现**：原计划给 `bg.tsx` 加网格渐隐画法并派生到图表风 3 板，实际只补了 `steps` 的 `bg`。判断依据：图表风板板内自绘 `MeasGrid`、扁平风板自带色块构图，叠加会打架。故本轮「背景方向」的实际交付 = 修补缺失 bg + fx 前景层重建，未新增 bg 画法。
- 缺陷 6（image 组板式）不属本刀范围，仍需用户先定「图像从哪来」。

本阶段解决的问题：fx 通道在亮底上完全无输出（比文档所记严重）；19 个 v2 板式 + 50 个旧 `P()` 板一次全覆盖；新增板式不会再漏 fx；「纯排版无氛围」的编辑风有签名动效。
是否可以进入下一阶段：是。
下一阶段入口：baseline-audit 缺陷 6（image 组板式，需用户定「图像从哪来」）；缺陷 5 槽级 m×mx 自动门禁。

## Phase 9 收尾刀 — 缺陷 5（槽级动效冲突门禁）+ 缺陷 6（image 组满版化）（2026-10-16）

状态：PASS
本阶段目标：关闭 baseline-audit 缺陷 5 与缺陷 6，清空 Phase 9 遗留待办。

### 缺陷 5 — 槽级动效冲突门禁（commit 56a2b38）

- 新增 `src/motion/props.ts`（tween 属性占用表）与 `src/motion/conflict.ts`（同一槽上两条 tween 在同一段时间写同一属性的检测）。
- `schedule.ts` 导出 `slotTweens`：门禁与演出共用同一份排期 —— 两处各算一遍的话，「只在某种 pace/拍长下才撞」的错会从缝里漏过去。
- `plan.ts` 第四遍把冲突推进 problems（硬门禁）；`stage.tsx` 改为只读 DOM 声明的 intent（data-motion/data-mx）喂给 slotTweens，不再自己算入场/强调时机。
- 测试：`motion-props` 12 + `motion-conflict` 12 新增。

### 缺陷 6 — image 组满版化（commit d8b1e32）

图像层确立两个来源，都走「预览导出同源」约束：

1. **真实照片**（收编此前未提交 WIP 并修复阻塞）：8 张语义标签照片（`public/photos/*.jpg`）+ `im-photo-bleed/split/duo/note` 四套 photo 槽版式，canvas 图像层直画、SVG 留占位保槽序。plan 挂 `pickPhoto` 语义选图，标签没命中就不用图（配错图比没图更伤）。**修复 build 阻塞**：原 `import x from "./photos/*.jpg"` 指向不存在的 `src/assets/photos/`，`vite build` 直接 Could not resolve；改为 `/photos/<name>.jpg` 同源 URL。安全区门禁为 photo 槽加出血豁免（满幅铺底正是构图意图）。
2. **程序化 SVG 插画**（本刀新增）：`src/layouts/im-board.tsx` 六套满版 Board —— 管道回路（过程）/ 分层堆栈（依赖）/ 两极对照（比较）/ 生长阶梯（累积）/ 门缝（转折）/ 颗粒场（大量同向）。主体几何由旁白信号驱动：要点数→节点数/层数/级数、左右字数比→体量比、数字量级→颗粒密度；不臆造具体物件。与 v2 共用 Board 契约（profile 换皮、data-anim 钩子、无 Math.random）、共用 custom 渲染通路。全部纯 SVG 图元 —— 无 `<image>`/foreignObject/外链，rasterize 序列化不被污染。

执行命令：`npx tsc --noEmit`、`npm run check`（逐文件）、`npm run build`、`node tools/run-ts.mjs tools/im-shots.tsx`、无头 Chrome 接触印相截图、`node tools/run-ts.mjs tools/dbg-photo.ts`（图表风泄漏定位，已删）。
测试结果：**19 个测试文件全部通过**（含新增 `im-board.test.tsx` 12 例：渲染安全 / 构图随内容变 / 三系换皮 / 确定性 / 色板归属）。修复两个既有失败：photo 槽安全区误报、覆写图表风时 photo 版式泄漏进三件套断言。
真实渲染证据：`.tmp/im-board/sheet.png`（6 板 × 3 系接触印相，目视通过：构图随内容变、色板跟 profile、无空板）。
输出文件验收：vite build 成功（79 模块）；本刀为版式层改动，不产生新 MP4（导出链路未动，e2e 基线仍为 Phase 9 的 14/14）。
本阶段解决的问题：图像层从「20 个通用图标配 13 套槽位版式」扩成「语义照片 + 程序化满版插画」双通路；缺陷 5 的槽级 tween 撞车从不可见变为硬门禁；vite build 从损坏恢复。
尚存缺陷：baseline-audit 六项缺陷中 2/5/6 已关闭；**1（BEAT NN 母版角标进成片）与 3（emphasis 死字段）** 状态待核（可能在 Phase 8 第二刀已顺带处理，未复核）；4（长句 headline 依赖人工覆写）仍开放；「风格整体差异自动量化」仅有 fx 通道，整帧层面未做。
是否可以进入下一阶段：是。
下一阶段入口：Phase 10 — 端到端视觉质量保证与返修闭环（计划 §5 Phase 10：五类题材测试集 + QA 报告 + 评分规则 §6 落地）。

## Phase 10 — 端到端视觉质量保证与返修闭环（2026-10-16）

状态：PASS（QA 全绿；评分 §6 见下）

本阶段目标：Phase 9 之前的所有验收都是「管线跑通了没有」——门禁绿、测试过、能导出。这不能回答「画面好不好看、有没有毛病」。Phase 10 要的是真看片：把五种题材的成片逐帧看一遍，把看到的毛病改掉。

### 验收工具（新增，本身也是回归夹具）

- `tools/cdp.mjs` — 零依赖 Chrome CDP 驱动。项目约束是「不引入外部框架只为用而用」，所以不装 playwright/puppeteer，直接用 Node 内置 WebSocket 走 CDP。
- `tools/phase10-qa.mjs` — 五类题材各一份 SRT（对应计划 §5 Phase 12 五个话题），每类跑六组检查：A 规划与门禁 / A3 时间轴覆盖 SRT / C 无空白爆白帧 / D 每拍镜内运动 / E 确定性 / B 文字不出安全区 / F 成片 ffprobe 验收（分辨率·帧率·时长·**无音轨**）。

工具侧踩过的四个坑，都写进代码注释了（它们比缺陷本身更容易复现）：

- **Chrome profile 必须放项目外**。放项目里时 Vite 的文件监听会去 watch Chrome 正在写的 Cookies，Windows 上锁死，Vite 自己的 watcher 先 EBUSY 崩掉。清理要 `taskkill /F /T` 同步杀完再删。
- **dev server 必须显式 `--host 127.0.0.1`**。vite 默认对 localhost 只听 IPv6 `::1`，Chrome 连不上 HMR websocket，模块图建不起来，监听器根本没挂上——表现是「点了 13 次仍无舞台」，看着像 UI 坏了，其实是连接问题。
- **逐帧取样必须走 `__renderFrame` 显式重画**。`seek()` 只推时间轴置脏，真正重画在 rAF 循环里；测试为省性能关掉了自动渲染，于是读到旧帧，D1（镜内运动）恒为 0。
- **`frame` 必须是 `t` 的函数**。后期颗粒偏移按帧号取（`Math.imul(frame,37)`），用「调用计数器」当 frame 会让两次采样落在不同帧上，E1 误报不确定。
- 另：CDP 单次求值超时要能按需放大——导出整片是一次阻塞调用，208s 片子（4998 帧）在默认 120s 上限处被掐断。

### 四个真实缺陷（QA 报出来的，git stash 回退验证过回归测试确实抓得住）

1. **时间轴逐拍漂移，片尾被静默丢掉（最严重）** — `schedule.ts` 的 `at` 锚点是「上一拍所有 tween 的最远结束点」减交叠，而那个值天然 ≥ 上拍的 `end`，于是每拍往后拖 0.25s、逐拍线性累积。01 语料 11 拍实测片长 **69.46s**，真实 SRT 结束在 **73.16s**——片尾 **3.70s（约 110 帧）在成片里完全消失**，3 分钟长片丢得更多。导出按 `stage.duration` 编码，短的那截就是成片时长，所以这不是「预览不准」，是**导出的 MP4 真的少一截**。SRT 才是时间的权威来源，改为 `at = shot.start - OVERLAP`；`stage.tsx` 另加占位 tween 把时间轴拉到真实片长。

2. **`v2-vertical` 竖排列掉出画面** — 「你手上只有一串 www 开头的字母」取 9 字成列，只卡了 `size ≤ 92` 没卡列总高：9 × 62 × 1.16 = 648，末行基线落到 673，整字出下边 93px。改为按列高反推行距并限制最大字数；顺带把副文本按可用宽度折行。

3. **巨号数字带单位冲出右边界** — 字号只按 `shown` 算（1000px 满宽），单位却贴在 `shown` 右缘再 +40px。03 语料拍4「0.06 美元」：单位落 x=1180、宽 94 → 出右 72px。另外那个 +40 的基准本身算错了——`shown` 以 x=640 居中时右缘是 `x + len*size/2`，公式又加了一遍半宽。`v2-num-giant` 与 `v2-data-giant` 同源，两个都修了（先修错过一次板子：这两个不是同一个板）。

4. **`v2-steps` 左下大字两行时出下边** — 原实现一行到底，SVG `<text>` 不自动折行。**关键认知**：浏览器里 CJK 46px 字号的 `getBoundingClientRect` 高 **82px ≈ 1.78em**（含下伸部），不是常以为的 1.0~1.3em。第一版按「基线 648 + 安全区 60」修完仍出下边 27px；改成按实测 1.78em 反解末行基线才真正收进版心。

### 两个自动检查抓不到、抽帧目视才发现的缺陷

**（1）画面上的数字被改值** — QA 六组全绿之后抽帧看成片，发现 03 语料拍4 画面上写的是「每度大约 **0 09** 美元」——**小数点没了**。

根因在 `stripPunct`（`src/core/text.ts`）。画面文字净化规则是「上画面的文案不带标点」，实现是把 ASCII/CJK 标点全表换成空格，`.` 和 `,` 都在表里，于是 `0.06` 变成 `0 06`。这不是排版瑕疵，是**数据被改值**——0.06 和 06 是两个数。改法：数字语境先挖坑再净化（`. ,`（含两侧空白，旁白常写「0. 06」）和紧跟数字的 `%` 属于数值本身，占位成 U+E000 私用区码位，净化完按原字符还原）；占位符选私用区是有讲究的——`ASCII_PUNCT` 盖 0x21-0x7E、`CJK_PUNCT` 盖 0xA1-0xFF65，两段都盖不住 U+E000。`hasPunct`（门禁检测口径）同步改，否则门禁会把 0.06 判成「含标点」；那里也不能「替换回 `.`」，因为 `HAS_PUNCT` 本身就含 `.` 和 `%`。

**（2）白字画白底，文字不可读**（commit de1e6b0）— 做完接触印相（每 120 帧取一帧拼图）继续目视，02 语料拍1 整幅接近全白、文字几乎看不见。

根因是 token 语义用错：**cream 是反白专用色**——三系都是浅色（编辑风 `#f3ede4`、扁平/图表 `#ffffff`），语义是「压在深色块上的字」。但 `v2-balance` 把支点三角、横梁、两端文字全用 cream，而底也是纸白亮底；`v2-strata` 同理（cream 大字压 blush/sand/clay 浅色带）。三系实测对比度 **1.00 / 1.07 / 1.00**。`ink` 才是「画在纸上」的正确语义（三系都是亮底上的深色），两处都改用 ink；修后抽帧复核，天平变为深墨线+深墨字，完全可读。

顺带补了一道门禁防复发：按实际渲染出的颜色算 WCAG 相对亮度差，逐 profile 断言「文字压纸白底 ≥ 3.0」，不逐板点名、靠数据说话。第一版写成「跳过 cream/paper 填充」反而把出问题的那个用法跳过了（正是它不可读才要判失败）；已改，并用 `git stash` 回退源码验证三系全部报出。

### 方法论结论（写进 QA 工具注释）

**几何门禁不等于内容正确，也不等于画面可读。** 六组自动检查测的全是几何（出没出安全区、有没有运动、确定性、是不是纯白帧），C1 甚至会把「整幅接近纯白」判为通过。上面两个靠抽帧才发现的缺陷——数字被改值、文字不可读——没有任何一条自动检查覆盖。第二类已补版式层对比度门禁；**第一类在 commit cb891c1 补齐**：

**G1 画面数字守恒**（`tools/phase10-qa.mjs`）。不抽帧 OCR —— 项目契约是「HTML 是视频画面的权威来源」，canvas 只是 HTML 的光栅化结果，直接比对渲染后 DOM 里真实存在的 `<text>` 节点比 OCR 既可靠又便宜。判据是**画面 ⊆ SRT**：画面上出现的每个数字都必须能在该拍 SRT 原文里找到同值形态。实测能精确抓出 `0.06 → 0 06` 的三处拍，且对年份/拍号/坐标轴派生刻度零假阳性（口径经两轮收敛，每轮都是实测逼出来的：先按「SRT⊆画面」写 → 年份假阳性；再扫整层文本 → 坐标轴刻度被正则黏成假 token）。

门禁做了双向往返验证（注入回归 → G1 报三处；恢复 → 五题材 0 失败）。没验证过的门禁等于没加。

### 验收（全部实跑）

- tsc 零错；**19 个测试文件全部通过**（含 5 条新回归：竖排列底缘、单位右缘、steps 折行、小数点、千分位/百分号/句末逗号/hasPunct 同口径）；`npm run build` 成功。
- **QA 五题材 0 失败 0 告警**（`node tools/phase10-qa.mjs`）：

| 题材 | 拍数 | 片长 | 片长=末拍 SRT end | 最小镜内 Δ | 确定性 | 成片 |
|---|---|---|---|---|---|---|
| 01 科普/机制解释 | 11 | 73.16s | ✓ | 5.73 | 0.000 | 1280×720 / 24fps / **无音轨** |
| 02 情绪/关系叙事 | 16 | 118.04s | ✓ | 1.42 | 0.000 | 同上 |
| 03 数据/趋势/比例 | 12 | 78.00s | ✓ | 4.98 | 0.000 | 同上 |
| 04 科普/流程（长片） | 29 | 208.32s | ✓ | 1.48 | 0.000 | 同上 |
| 05 抽象概念/哲学观点 | 24 | 70.35s | ✓ | 2.38 | 0.000 | 同上 |

- 成片产物：`.tmp/phase10/01..05.mp4`（34.2 / 52.9 / 36.4 / 95.2 / 31.5 MB），ffprobe 逐个校验单 video 流、无 audio 流。
- 抽帧目视复核：01 拍2（分屏色块）、03 拍4（坐标柱 + 小数点修复后）、05 拍22（steps 折行后）三帧逐一看过，文字均在版心内、`0.09 美元` 小数点完整。

本阶段解决的问题：导出的 MP4 比 SRT 短一截（丢片尾）；三个版式的文字越界；画面上数字被净化层改值；两处「反白色当墨色用」导致文字不可读。QA 工具链从无到有，且每个发现的缺陷都立即转成回归测试（含对比度门禁）。
尚存缺陷：baseline-audit 缺陷 1（BEAT NN 母版角标）与 3（emphasis 死字段）状态仍未复核（Phase 8 第二刀疑似已顺带处理，未验证）；缺陷 4（长句 headline 依赖人工覆写）仍开放（照片层那轮也记录了它的延伸症状）；Phase 12 的纯历史/事件叙述语料仍缺（04 longform 是咖啡供应链科普，不是历史叙述）。
是否可以进入下一阶段：是。
评分（计划 §6 落地）：规则见 `docs/project/visual-quality-rubric.md`，本轮记分见 `docs/project/quality-score.md`。**机器记分卡自动维度 8 项：7 个 5 分、镜头连续性 2 分**，退出码 1。主观维度按 rubric 规定一律标 `待人工`（人工盲评需 ≥10 人、随机 ID、MOS 带置信区间，本轮不具备条件，不编分）。镜头连续性的 2 分不是形式主义：`03-data-comparison.srt` 的 visual-ab 覆盖率是 **0** —— 数据板之间视觉上完全不承接，`OVERLAP` 只是时间交叠。属 Phase 11 的能力沉淀。
下一阶段入口：Phase 11（规模化案例库与 Skills）或 Phase 12（补纯历史/事件叙述语料 + 正式验收）。

## 照片层返修 —— 「代码全对、画面全错」的两个缺陷（2026-10-16，commit 8229203）

状态：PASS
本阶段目标：缺陷 6 的真照片通路此前从未被像素级验证过，本刀把它从「代码存在」推到「成片里看得见、且用得上」。

### 缺陷 A：照片 100% 不可见（像素差 0.000）

`photos.ts` 的加载、`plan.ts` 的选图、`render/frame.ts` 的 canvas 图像层、四套 photo 版式 —— 全都在，**画面里一张也看不到**。

诊断手段（同Phase 9 的 fx A/B 口径）：把 photo 槽的 `photo` 字段改成不存在的 id 让它走降级素色块，两帧相减。
结果四个照片拍的像素差**全是 0.000** —— 照片层对画面的贡献是零。

根因与 Phase 9 的 fx 层同一个坑，但**方向相反**：

- fx 层：画在 SVG 之下，被 v2 满版板完全遮住 → 修法是**把 fx 层移上去**（内容之上、后期之下）。
- 照片层：**不能移上去** —— 版式设计上 headline 就是要压在照片上（`im-photo-bleed` 写明「照片是底、大字浮在其上」），移上去文字就被盖。
  所以必须由满版层**主动让位**。

而让位这件事没人做：`WashLayer` 是三层**不透明**全幅 rect（线性渐变 + 柔光斑 + 暗角），`BgLayer` 五种画法也全是满幅图案。
画在它们下面的东西，必然被盖 100%。

修法：新增 `src/layouts/cutout.tsx` —— `photoCutouts()` 把 photo 槽的归一化网格换算成像素矩形，`CutoutMask` 生成「全幅白 + 每张照片一块黑」的挖洞遮罩；`wash.tsx` 的三层 rect 与 `bg.tsx` 的整层按 photo 槽挂 `mask`。无 photo 槽时不生成 mask（不付合成代价）。

同口径复测：像素差 0.000 → **19.9–54.6**，93.7%–99.6% 样本在变。

### 缺陷 B：97 拍只出2 张照片（选版饥饿）

`pickLayout` 先试 v2 池，而 v2 满版库**根本没有 image 组**；同时 `requireFirst` 在 v2 池几乎从不失败（实测 01 语料 11 拍全在 v2 里挑到）。
两个条件叠加 = catalog 里那4 套照片板永远轮不到 —— 即使语义选图明确命中了。

修法：照片拍（编辑风 + image 组未达组级帽 + 版式确有 photo 槽）绕过 v2 优先级，先在 catalog 直取。组级帽仍生效，不让照片淹掉整片。
顺带把 `preferredGroups` 的照片分支收敛成「**编辑风才改首选顺序**」—— 图表风是白底数据系、扁平风是平涂色块，两种语言不容照片；而原实现的 `flat-vector` 分支提前 return，照片在扁平风拍里被静默丢弃。

修后各语料命中：01 从 0→3、03 从 0→3、04 从 0→7，全库 97 拍 **2 → 20**。

### 验收（全部实跑）

- tsc 零错；**352 测试逐文件全过**（19 文件 0 失败）。
- plan-dry **7/7** 语料门禁通过；constraint-audit **216 版式 0 错误 0 告警**。
- e2e 14/14：01 语料 **2195 帧精确**、09 语料 **1536 帧精确**，无全黑/爆白。
- qa-frames 确定性 **80/80 帧「重复 0.000」**、页面零报错（09 语料 16 拍 × 5 帧）。
- 目视：`.tmp/pshot3/b02.png`（机房双框）、`.tmp/pshot3/b05.png`（光纤满幅 + 大字浮其上）、`.tmp/p01/b06.png`（左图右文）逐帧看过，照片清晰、纸色罩压得住、文字可读。

### 方法论（值得带走）

**「代码路径存在」不等于「画面里有」**。这一刀的两个缺陷都不是写错，是**放错了层**和**没走到**，静态检查、类型检查、单元测试全都通过 —— 只有像素差和抽帧目视能抓到。凡是「新加的视觉层」，验收标准必须是「像素差非零」而不是「函数被调用过」。

### 遗留（未修）

照片拍的 headline 在 `im-photo-split` 这类窄槽里被 compose 分句截断（「拿到 IP 之后」在前，后半句掉到 caption 小字）—— 根因是 compose 的分句阈值与 photo 版式的槽宽不匹配，属 baseline-audit 缺陷 4（长句 headline）的延伸。

## 视觉层 A/B 门禁 —— 把「画面里到底有没有」变成常驻断言（2026-10-16）

状态：PASS
本阶段目标：上一刀（照片层返修）暴露出一个方法论问题——**「代码路径存在」不等于「画面里有」**。
本项目连踩三次同一个坑，每次形态不同，静态检查全放过：
① fx 层用 `lighter` 混合，而三系底色全是亮底 → 叠什么都没增量；
② fx 层画在 SVG 之下，被 v2 满版板整个盖住 → 开/关像素差 0.000；
③ 照片层画在 `WashLayer` 三层不透明满幅 rect 之下 → 像素差 0.000。
三次的共同点：类型检查过、单元测试过、e2e 14/14 全绿，唯独没人问过「这一层在画面里吗」。
本刀把这个问题固化成门禁：**每个 canvas 叠加层都必须用像素证明自己存在**。

### 工具：`tools/visual-ab.mjs`

对四个层逐一「关掉 → 重渲染同一时刻 → 像素相减」，差为 0 即失败：

| 层 | 关法 | 静态均差门槛 | 运动量门槛 |
|---|---|---|---|
| 特效层 fx | `layout.fx = "none"`（合法的显式关闭） | > 0.05 | > 0.1 |
| 照片层 photo | 抹掉 `slot.photo` 与 `shot.photo`（走素色块降级分支） | > 2.0 | — |
| 连续性层 continuity | `shot.continuity = []`（ghost 消失，自标记仍在） | > 0.015 | — |
| 后期层 post | `__noPost` 钩子跳过 `applyPost` | > 0.15 | — |

两个设计决定：

1. **覆盖率也是判据**。某一层在语料里没有可测拍 → 门禁失败（03 语料的 continuity 就是 0 覆盖被拦下的）。
   否则「跑过了但什么都没测」会伪装成通过。ghost 只出现在共享数字的拍上，若 `enrichNarrative`
   不再派生 continuity，覆盖数归零，门禁直接红——这比单拍阈值更能防住「特性悄悄消失」。
2. **门槛按设计标定，不按绿灯标定**。连续性层初版门槛拍的是 0.15，实测 0.036 被判失败；
   查实现发现 ghost 是**故意安静**的（形状 alpha 0.26、连接线 2.5px/0.55，continuity.ts 的探针
   注释写着「1.5px/0.3 落在色带噪声底以下，等于没画」）。0.036 正是该设计强度下的应有值，
   「不存在」是 0.000 —— 门槛改 0.015（实测值四成，离 0 有 2.4 倍余量），而不是把线降到能过为止。

运动量判据（仅 fx）沿用 Phase 9 的 `|(开(t1) − 关(t1)) − (开(t2) − 关(t2))|`：先减掉内容只留
fx 层，再看两时刻之差，机位推近与入场动画全部抵消。`tools/fx-ab.mjs` 收敛为它的薄包装
（`--layers fx`），不再维护第二份页面 helper。

### 反向验证（门禁自己先证明有用）

一个永远绿灯的门禁没有价值。故意把 `drawFx` 调用改恒假再跑：三拍全部测出 0.000，退出码 1
（证据 `.tmp/vab-neg/report.md`）；还原后同口径复跑逐位一致。post 层的钩子是自证的——
若 `frame.ts` 不读 `__noPost`，「关后期」与「开后期」两次渲染完全相同，差值归零，门禁一样红。

### 实测（全部实跑，dev server + 全新浏览器会话）

| 语料 | 拍数 | fx | photo | continuity | post | 判定 |
|---|---|---|---|---|---|---|
| 09-photo-demo（16 拍） | 6 拍 × 层 | 0.569–2.891 / 动 0.610–2.766 | 60.8–79.8 | 0.036 | 5.72–9.47 | 全过 |
| 01-explanatory-tech（11 拍） | 8 拍 × 层 | 0.519–2.883 / 动 0.589–2.689 | 58.9–105.3 | 0.087–0.152 | 4.76–9.56 | 全过 |
| 03-data-comparison（12 拍） | 6 拍 × 层 | 0.519–2.727 / 动 0.589–2.664 | 56.0–105.8 | 0 覆盖（按设计判失败） | 4.78–9.54 | fx/photo/post 过 |

数字跨会话逐位可复现（同一会话重跑 09：2.785/2.738 与首跑完全一致）。

### 环境抖动的一次误判与排除

qa-frames 复跑时连出两次「重复渲染差 29.583 / 23.996」+ `__stage` 消失。用 `git stash`
把本刀改动藏起来对照，**同样失败且更早**；随后浏览器 eval 完全超时（`agent-browser close --all`
后重开即恢复）——结论是浏览器会话被反复重载拖死后的环境抖动，不是代码回归。
全新会话重跑：80/80 帧「重复渲染一致」、页面零报错。教训：**QA 门禁报「不确定」时，
先换全新浏览器会话再下结论**，否则会把环境故障当成产品缺陷去「修」。

### 验收

- tsc 零错；352 测试逐文件全过（19 文件 0 失败，与本刀前一致——本刀不改产品行为）。
- plan-dry 3/3 代表语料门禁通过；constraint-audit 216 版式 0 错误 0 告警。
- qa-frames 确定性 80/80 帧「重复 0.000」、页面零报错（新会话）。
- `frame.ts` 的改动只有 2 行（`postDisabled()` 守卫），不置位时行为与从前逐字节一致。

### 下一步

缺陷 5 的槽级 `m`×`mx` 自动门禁已在此前完成（props.ts 录制式属性模型 + slotTweens 单一权威 +
conflict.ts），剩下的是内容正确性门禁（「画面数字 vs SRT 数字」自动比对）与评分规则 §6 落地。

## 评分规则 §6 落地 —— 十维记分卡（2026-10-16）

状态：PASS
本阶段目标：把项目档案 §6「视觉质量与工程质量的评分规则」从纸面落到可执行——
十维各自 1–5 分、固定解释锚点，机器能判的走门禁，机器判不了的标「待人工」。
**禁止只用一个模糊的"美感分"**，也禁止给主观维度拍脑袋编分。

### 交付物

1. `docs/project/visual-quality-rubric.md` —— 规则本体：十维总表（关注问题 / 验证方式 / 记分类型）、
   每维 1/3/5 锚点（全部可观察判据）、自动记分映射表、人工盲评规则（蒸馏自
   references/manual/06：ACR 五级标签对照、隐藏版本随机顺序、内部 ≥10 人 / 正式 15 人、
   MOS 必须带置信区间、效度筛查、环境留痕、双轨通过）、改进有效的最低证据。
2. `tools/quality-score.ts` —— 记分卡工具（`node tools/run-ts.mjs tools/quality-score.ts`）：
   证据聚合器，不重造门禁。进程内直调 `plan` / `checkLayout` / `buildMotionSchedule`（与 plan-dry、
   constraint-audit、motion-audit 同判据），消费 `.tmp/phase10/report.json`、visual-ab 的
   `report.json`（本次给 visual-ab.mjs 补了机读输出，markdown 只给人看）、ffprobe 探测 MP4、
   `npm run check` 日志。
3. `.tmp/quality/scorecard.md/json` —— 首次实跑记分卡（7 语料 113 拍全量证据）。

### 关键设计决定

1. **混合维度只出机器层分数**。构图/排版/动画/连续性/风格五维是「混合」：机器分只证明
   约束/守恒/存在性层无缺陷，主观锚点（好不好看、有没有设计感）由盲评补齐，记分卡上
   明写「待人工」。叙事推进与图形质量两维纯主观，恒为待人工，工具只附证据
   （拍数/版式多样性/角色分布）。
2. **覆盖缺口归内容维度，不污染工程健康度**。03 语料 continuity 0 覆盖会让 visual-ab
   退出 1——初版把这条并进「工程稳定性」，导致机械健康度被一个内容覆盖问题永久判 1。
   拆开：连续性维度按门禁设计判 2 分，工程稳定性只问「有报告的语料里测过的行是否都非零」。
3. **缺证据 = 待人工，不是默认绿**。测试日志不给（`--tests` 缺省）时工程稳定性输出 null
   而不是 5——没测过就不能算稳定。语义准确（无 phase10 报告）、输出正确性（无 MP4）、
   镜头连续性（无 vab 报告）同样处理。
4. **G1 只覆盖数字守恒**，专名与事实漂移仍需 findings 式人工核查——记分卡在语义准确维度
   的「待人工」里如实写明，不夸大自动化的覆盖面。

### 首次实跑（全量证据，数字可复现）

7 语料 113 拍规划 problems 0 / warnings 0 · 216 槽位版式硬错误 0 / 告警 0 ·
运动审计冲突 0 / 越界 0 · phase10-qa（03）A–F + G1 0 违规 · 19 测试文件全过 ·
ffprobe（720p@24 / 78.00s / 单流 h264 / 无音轨）全过 · visual-ab 01/09 全过、03 continuity 0 覆盖。
判定：自动维度 8 个（过低 1：镜头连续性 2 分，03 覆盖缺口按门禁设计即失败）· 待人工 2 个 · 退出码 1。
visual-ab 三语料重跑数字与上一会话逐位一致（09 拍1 fx 2.785/2.738、post 9.474）。

### 反向验证（`.tmp/quality-neg/report.md`，五用例全过）

| 用例 | 篡改 | 实测 | 退出码 |
|---|---|---|---|
| A | phase10 注入 G1 失败 | 语义准确 5→1 | 1 |
| B | --mp4 指向非 MP4 文件 | 输出正确性 5→1 | 1 |
| C | vab 特效行置不过 | 工程稳定性 5→1（连续性不受影响——按层归因，正确行为） | 1 |
| C2 | vab 连续性行置不过 | 镜头连续性 5→2 + 工程稳定性 1 | 1 |
| D | 正对照（全过证据） | 过低 0 | 0 |

另补一次 tsc  targeted 检查（`tools/` 不在 `npm run check` 的 tsconfig include 里，
run-ts 的 esbuild 不做类型检查）：抓到 4 个问题（2 未用变量、1 处 filter 后窄化失效），
全修后复跑记分卡与反向验证结论不变。

### 下一步

Phase 12：历史/事件叙述语料补充（五类题材里的缺口）；或按尚存缺陷选方向
（照片拍窄槽 headline 截断仍是 baseline-audit 缺陷 4 的延伸）。
人工盲评（rubric §四）需要真实评审者，属用户侧动作——工具与模板已就绪。

### 补记（同日，commit 434851d 之后）

- 并行会话在同一轮落地了 §6 的**人工判分文档** `docs/project/quality-score.md`（10 维逐项证据 +
  加权 4.1/5，动画质量/镜头连续性两个 3 分如实记下）。该文已把 `visual-quality-rubric.md` 定为
  规则正本、把 `quality-score.ts` 定为记分卡生成器——两份产物分工：**它记录人对机器的复核，
  本工具负责机器维度可随时再生成**。其复现命令初版传了逗号分隔五个 MP4 而工具只收单文件，
  本次给 `--mp4` 加上多文件支持（逗号分隔，全部通过才 5 分）并补正该命令（缺 `--tests` 时
  工程稳定性按规则判待人工，不默认绿）。
- 五语料成片（01–05，720p@24）一起复测：输出正确性 5 分、工程稳定性 5/5；总判定不变
  （退出码 1 仍由 03 的 continuity 0 覆盖驱动——那是门禁按设计判的失败，不是工具误报）。
- 方法论注脚：`quality-score.md` 给镜头连续性打 3 分的理由（OVERLAP 只是时间交叠、
  五项语义承接一项都没做到）与本工具机器分度量**的不是同一件事**——visual-ab 只证明
  ghost 层有像素输出，语义承接有没有发生是主观维度。两个分数都诚实，别互相覆盖。
