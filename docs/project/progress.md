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
