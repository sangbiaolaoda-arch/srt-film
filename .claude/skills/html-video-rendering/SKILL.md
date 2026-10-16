---
name: html-video-rendering
description: >
  可寻址 HTML 动画的确定性逐帧渲染与导出。当任务涉及「把 HTML/SVG 动画导出成
  MP4」「按时间点取指定帧」「保证多次渲染结果完全一致」「浏览器自动化驱动
  渲染」时加载。核心主张：frame 必须是 t 的纯函数，时间轴必须锚在绝对时间。
  涵盖 CDP 驱动、canvas 光栅化、导出规格与无音轨要求。
---

# HTML → MP4 确定性渲染

## 契约（违反了会静默出错）

### 1. HTML 是权威来源，MP4 是产物

不要反过来从 MP4 反推「应该长什么样」。改画面就改 HTML。

### 2. `frame` 必须是 `t` 的纯函数

后期层（颗粒、噪点、暗角）按帧号取偏移：

```ts
// 对
const grain = hash(x, y, Math.imul(frame, 37));
// 错：用调用计数器当 frame
let calls = 0; const frame = ++calls;
```

**为什么**：用计数器会让「同 t 渲染两次」落在不同帧上，破坏确定性验证 —— 而确定性是导出可复现的前提。

### 3. 时间轴锚绝对时间，不锚累积游标

```ts
// 对
const at = i === 0 ? 0 : Math.max(shot.start - OVERLAP, 0);
// 错：锚上一拍的 tween 结束点
let running = 0; const at = running - OVERLAP;
```

后者每拍漂移一个交叠量、逐拍线性累积，**片尾被静默吞掉**（实测 11 拍丢 3.70s ≈ 110 帧）。SRT 才是时间的权威来源。

### 4. 时间轴要盖住真实片长

```ts
const lastShot = shots[shots.length - 1];
if (lastShot && lastShot.end > tl.duration()) tl.set({}, {}, lastShot.end);
```

导出按 `stage.duration` 编码，短的那截就是成片时长。

### 5. 无音轨

成片只有 video 流。`ffprobe` 逐个确认，别靠假设。

## 浏览器驱动：零依赖 CDP

项目约束是「不引入外部框架只为用而用」，所以直接用 Node 内置 `WebSocket` 走 Chrome DevTools Protocol，不装 playwright/puppeteer。

核心接口：

```js
send(method, params, sessionId, timeoutMs = 0)   // 默认 120s
eval(expr, timeoutMs = 0)                        // 导出是阻塞调用，超时要能放大
```

**超时按工作量放大**：导出整片是一次长阻塞调用，208s 片子（4998 帧）在默认 120s 上限处被掐断。

## 三个必踩的坑

### Chrome profile 必须放项目外

放项目里时，Vite 的文件监听会去 watch Chrome 正在写的 Cookies，Windows 上锁死，**Vite 自己的 watcher 先 EBUSY 崩掉**。

清理要同步杀完再删：

```js
execFileSync("taskkill", ["/F", "/T", "/PID", String(pid)]);
// 然后重试删除（Windows 上有残留锁延迟）
```

### dev server 必须显式绑 IPv4

```bash
vite --host 127.0.0.1
```

vite 默认对 `localhost` 只听 IPv6 `::1`，Chrome 连不上 HMR websocket，**模块图建不起来、监听器根本没挂上** —— 表现像「UI 坏了」，实际是连接问题。

### 逐帧取样要显式重画

```ts
stage.setAutoRender(false);       // 测试为省性能关自动渲染
stage.seek(t);
// seek 只推时间轴置脏，真正重画在 rAF 循环里 —— 必须手动调：
await renderFrame({ ctx, svg, shots, t, frame: Math.round(t * 30) });
```

## SVG → canvas 光栅化

把 `[data-layer="i"]` 序列化成**独立 SVG 文档**，用根节点的 `viewBox`。

**为什么带 viewBox**：GSAP 的 transform 会随元素一起序列化进 SVG，canvas 结果才和实时 DOM 一致。漏了 viewBox 则尺寸对不上。

**canvas 污染**：`rasterizeLayer` 不能出现 `<image>` / `foreignObject` / 外部 URL，否则 canvas 被污染，后续读像素全部失真。要用图就用程序化生成的 SVG（自绘，不引用外部资源）。

## 版式层的硬约束

```ts
// 板的签名
(content, profile) => JSX.Element
```

- 只用 `profile` 里的 token，不硬编码颜色 —— token 在不同风格下语义不同（见 `visual-qa-and-repair` 缺陷 4）；
- 动效用 `data-anim` / `data-motion` 声明，不在 JS 里写动画；
- **禁止 `Math.random`**：确定性要求同输入同输出。粒子用 hash 伪随机；
- 确定性：同输入 → 逐字节一致的 DOM。

## 导出规格

```ts
exportMp4(stage, duration, opts)   // 注意是三个参数
```

- 分辨率 1280×720，24fps（`fps` 分母写 1 是整数帧率：`24/1`）；
- `t = f / fps`，`frame` 用 `f`（同一变量，别一个用 t 一个用 f 换算）；
- 编码走 WebCodecs + mp4-muxer。**mp4-muxer 的动态 import 要在 `warm()` 里预取**，
  否则第一次导出时才加载，超时窗口已经关了。

## 自检清单

- [ ] 同 t 渲染两次，逐字节一致
- [ ] 成片时长 ≥ SRT 最后一个 cue 的 end
- [ ] ffprobe：单 video 流、**零 audio 流**、分辨率帧率正确
- [ ] 版式里没有 `Math.random` / `<image>` / `foreignObject` / 外部 URL
- [ ] 时间轴锚的是 `shot.start - OVERLAP`，不是累积游标