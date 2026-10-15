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
