# 渲染契约（Render Contract）

> 本文件是 srt-film 渲染层的不变量清单。**门禁与重构都对照它，不要凭记忆。**
> 来源：项目反复踩坑后的固化（见 `docs/project/progress.md` 各 Phase 节）。
> 方法论背景：`html-visual-engineering-methodology-for-agents.md` §3 / §12 要求
> 「渲染由明确时间输入决定」「可复现性是自动化截图/调试/导出的基础」。

---

## 不变量

### C1. 画面是 `t` 的纯函数
- `renderFrame({ ctx, svg, shots, t, frame })` 在 `t` 相同、`shots` 相同的情况下，
  每次调用产出**逐字节一致**的像素（除后期颗粒——见 C6）。
- 推导：所有动态元素的位置/形状/颜色必须由 `t`（或 `frame`）决定；
  禁止 `Math.random`、禁止实时钟、`frame` 是 `t` 的派生（`frame = round(t * fps)`）。
- 反例（已修）：`phase10-qa.mjs` 的「确定性门禁」曾因用调用计数器当 `frame` 而误报；
  后期颗粒必须用 `Math.imul(frame, 37)` 取偏移，不能用计数器。

### C2. 时间轴锚 SRT 绝对时间，不锚累积游标
- `buildMotionSchedule` 里 `at = shot.start - OVERLAP`（OVERLAP = 0.25）。
- 反例（已修）：旧口径 `at = running - OVERLAP`（`running` = 上拍最远 tween 终点）
  逐拍线性漂移，11 拍吞掉片尾 3.70s。SRT 是时间的权威来源。

### C3. 成片时长 ≥ SRT 最后一个 cue 的 end
- 时间轴尾要显式伸到 `lastShot.end`，否则 `exportMp4` 按 `stage.duration` 编码会截短。

### C4. 逻辑坐标系固定
- 内部所有布局坐标基于 **1280×720**（`STAGE_W` × `STAGE_H`）；真实画布分辨率
  由 `W/H` 缩放适配（showreel 用 1920×1080 同理）。`drawContinuity` 里的
  `CORNER_POS` 是 1280×720 坐标系内的四角位置。
- 导出 ≠ 预览：两者共用 `renderFrame`，所以必然一致（frame.ts 顶部注释即此意）。

### C5. 确定性随机只用带种子 hash
- 任何伪随机（颗粒、粒子、抖动、停格）走 `core/rng.ts` 的 `hashSeed`，禁用 `Math.random`。
- 理由：C1 的前提。showreel 的不变量 ③ 同此。

### C6. 后期层可零贡献地剥离
- `globalThis.__noPost` 置位时 `applyPost` 跳过；QA 用它量「后期层贡献是否为 0」。
- 与 `m-shape-match` / `m-match-cut` 的 A/B 钩子同一性质：产品逻辑不依赖，只供 QA 读取。

### C7. 跨镜头连续性的硬几何约束
- `continuity.ts` 的 `ROLE_CORNER` 是固定表（7 角色 4 角落）。`HANDOFF` 表里的
  每个承接对**必须跨角**——同角色必同角 → ghost 与自标记重叠、连接线零长度，
  「继承」退化成「一个标记换形状」。
- 补 `HANDOFF` 边时不允许出现同角色边（tests/continuity.test.ts 守着）。
- 转场（见 §转场）是承接的「运动层延伸」：新拍从上一拍标记角放大展开（m-shape-match），
  或上一拍水平滑出时新拍同侧微移入位（m-match-cut）。

---

## 参数归属（方法论 §3.3）
- 风格相关：集中在 `STYLE_PROFILES`（editorial / flat-vector / chart-motion），
  版式只消费 token 不硬编码颜色。
- 时间/转场：集中在 `motion/schedule.ts` + `motion/catalog.ts`。
- 叙事承接：集中在 `core/compose.ts` 的 `HANDOFF` / `classifyRole`。
- 标记语汇：`render/continuity.ts` 的 `ROLE_SHAPE` / `ROLE_CORNER` / `motifOf`。
- 不形成互相污染的全局大配置：参数属于负责它的层。

## 门禁对照
| 不变量 | 已有门禁 |
|---|---|
| C1 确定性 | `phase10-qa.mjs` E1 确定性（`maxΔ=0.000`） |
| C2/C3 时间轴 | `phase10-qa.mjs` A3 时间轴覆盖 SRT |
| C4 分辨率 | F 成片验收（1280×720 / 24fps / 时长 / 无音轨） |
| C5 确定性随机 | 同 E1（两次渲染一致即间接验证） |
| C7 跨角 | `tests/continuity.test.ts`「每对必须跨角」 |
| 内容正确性 | G1 画面数字守恒（画面数字 ⊆ SRT 数字集） |

## 修改前自检
1. 是否引入 `t` 之外的状态来源？→ 破坏 C1。
2. 是否锚了累积游标？→ 破坏 C2。
3. 是否给 `HANDOFF` 加了同角色边？→ 破坏 C7。
4. 是否新硬编码了颜色/坐标而绕开 token / 逻辑坐标？→ 破坏 C4 + 参数归属。
