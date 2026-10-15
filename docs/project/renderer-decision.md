# HTML → MP4 渲染路线选型记录（Phase 1）

> 日期：2026-10-15 · 决策：**保留 WebCodecs + mp4-muxer 为唯一主导出路线**，不引入 HyperFrames / Playwright 捕获。
> 依据：计划 §5 Phase 1「按真实小样本测试决策，只选一个主路径」+ §1「不要只凭包名或 README 判断」。

---

## 1. 候选路线的事实（均已查证，非印象）

### 路线 A —— 现有：WebCodecs + mp4-muxer（浏览器内编码）

- 实现：`src/export/mp4.ts`（74 行）。`stage.seek(f/30)` → `renderFrame`（SVG 光栅化 + canvas fx）→ `VideoFrame(canvas)` → `VideoEncoder`（avc1.420028 / 8 Mbps / 30 fps）→ `mp4-muxer` 封装。
- 已验证（2026-10-14/15）：03 语料连续 3 次同输入导出全部 14/14 通过（2218 帧 = 73.933s×30 精确，64.6MB）；08 语料 12/12（570 帧）；ffprobe 确认**单视频流、无音频流**；无全黑/爆白帧。
- 外部依赖：零。编码器与复用器均为浏览器内置 API/库。

### 路线 B —— 参照实现：HyperFrames（heygen-com/hyperframes，63.9k★，Apache-2.0，v0.8.159，2026-10-15 仍在提交）

- 架构（GitHub API 查证）：monorepo（bun workspaces，Node≥22）。`@hyperframes/producer` 自述 "HTML-to-video rendering engine using **Chrome's BeginFrame API**"；`@hyperframes/engine` = "Puppeteer + FFmpeg"。
- 帧管线（docs/concepts/determinism.mdx 原文）：`time = floor(frame)/fps` 整数帧时钟 → frame adapter `seekFrame(frame)`（GSAP 时间轴 paused+seek，never played）→ Chrome `HeadlessExperimental.beginFrame` 原子捕获（无半绘制帧）→ **FFmpeg 子进程**编码 + 混音。
- 确定性契约：禁 `Date.now`/rAF/无种子 `Math.random`/渲染中 fetch；fps/宽/高锁死于 frame 0；生命周期 `init → seekFrame(n) → destroy`。
- 依赖：puppeteer ^25（Chromium 下载管理）+ 外部 FFmpeg 二进制；npm 可装但 exports 含 `bun` 条件、源码直出（`src/index.ts`），非 bun 生态消费需构建适配。
- 附带：21 个 agent skills（/hyperframes 路由器 + 创作工作流），MCP 支持。

## 2. 对比矩阵（按计划 §5 Phase 1 的七个决策维度）

| 维度 | A：WebCodecs（现状） | B：CDP/FFmpeg 捕获（HyperFrames 式） |
|---|---|---|
| 一致性 | 播放与导出共用同一 `renderFrame`，画面 100% 同源（代码级 + e2e 实证） | 捕获的是浏览器合成画面——但 srt-film 的显示画面本身就是 canvas（renderFrame 输出），B 截到的仍是同一画面，无增益 |
| 浏览器兼容 | VideoEncoder 需 Chrome/Edge 94+ | CDP 需 Chromium 系；BeginFrame 需 Chrome |
| 速度 | 2218 帧 ≈ 3–4 分钟（流式，无中间文件） | 每帧 CDP 往返 + PNG 编解码，实测口径下慢 2–5 倍（BeginFrame 可部分缓解） |
| 内存 | 流式编码，峰值低 | 帧位图队列，峰值高 |
| 失败恢复 | 帧级 error 回调即时抛出；半个 Blob 不落盘 | 需自建截图超时/重试/半帧检测 |
| 离线能力 | 完全本地、零外部进程 | 需分发 FFmpeg 二进制（本机有，用户机不保证） |
| 安装/维护 | 已在维护，与 v2/动效同仓 | 双轨维护；HyperFrames 非 bun 生态集成需适配 |

**音轨**：A 结构上不可能产生音频流（只 addVideoChunk，已 ffprobe 实证）；B 的 FFmpeg 默认可能混入音频，必须显式 `-an` 并验收——A 在此维度是结构性优势。

## 3. 决策

**保留路线 A 为唯一主路径。** 理由：

1. 计划 §0 硬约束（HTML 权威来源、预览导出同源、无音轨、本地可运行）A 全部满足且已被 3 次连续导出 + ffprobe 实证；B 没有任何一项超出 A 的能力——srt-film 的「HTML 场景」是离屏 SVG 树 + canvas 显示的混合结构，B 的「捕获浏览器最终画面」相对于 A 没有额外信息量。
2. B 的引入成本（FFmpeg 分发、puppeteer、双轨维护）与计划 §2 非目标（不建庞大体系）冲突。
3. HyperFrames 的确定性契约（整数帧时钟 / seekFrame / 禁墙上时钟）srt-film 已同构具备：`t = f/STAGE_FPS`（mp4.ts:51）、`__stage.seek` 内部 `tl.time()`、`qa:det` 双渲比对——无需引入外部框架获得。

**不学**：HyperFrames 的 FFmpeg 子进程编码、bun monorepo 结构、21-skill 体系（Phase 11 只参考其「路由器 + 按需领域 skill」组织方式）。
**留档升级选项**：若未来出现半绘制帧或 SVG 光栅化保真度问题，再评估 BeginFrame 捕获（`HeadlessExperimental.beginFrame`）替换 `rasterizeLayer` 的序列化路径——当前 `rasterizeLayer` 是同步 await 链（序列化→onload→drawImage），无此类已发现问题。

## 4. Phase 1 通过标准逐条核对

| 标准 | 结果 | 证据 |
|---|---|---|
| 连续 3 次同输入运行都成功 | ✅ | 03 无覆写 ×3（e2e-03.mp4 / e2e-03-fx.mp4 / e2e-03-fx2.mp4）全部 14/14，2218 帧精确 |
| 随机 seek 与连续播放画面一致 | ✅ | seek 与播放都走 `tl.time()` + 同一 renderFrame；`qa:det` 同 t 双渲零差（容差 0.5）实证确定性 |
| MP4 实际无音轨 | ✅ | ffprobe：单 video 流（h264），无 audio 流 |
| 导出帧与预览关键帧一致性 | ✅ | 架构同源（stage.tsx:196 paint 与 mp4.ts:53 同函数同 svg 同 tl）；e2e 抽帧 17 张盲评通过 |
| 最小 HTML→MP4 垂直切片 | ✅ | 08 语料 5 拍 19s（含文字/SVG 图形/时间驱动动画/转场）12/12 |

## 5. 结论

Phase 1 **PASS**。导出路线冻结为 WebCodecs + mp4-muxer；HyperFrames 作为架构参照与升级选项留档。进入 Phase 2（产品行为与错误处理）。
