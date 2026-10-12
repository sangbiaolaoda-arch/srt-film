# 参考实现 · 《光很慢 LIGHT LAG》

**45.000 秒 · 七场 · 单文件 · 零依赖** 的科技风科普片，是
[`docs/流程-确定性动画与逐帧验收.md`](../../docs/流程-确定性动画与逐帧验收.md)
里每一条契约与画面操控手法的可跑样本。

| 文件 | 说明 |
|---|---|
| `light-lag.html` | 正片。双击即开（自动播放，声音默认关，点右下「♪ 声音」） |
| `light-lag-contact-sheet.png` | 接触印相（逐帧验收的最终产物之一） |

## 它示范了什么

- **确定性时间轴**：`render(t)` 纯函数 + 确定性伪随机 `rnd(i,k)`，任意 seek 逐像素一致
- **对外接口**：`window.__tl = { dur, scenes, seek, play, pause, state }` —— `tools/qa-frames.mjs` 靠它自动取帧
- **错误收集**：`window.__err`（`error` + `unhandledrejection`）
- **画面操控**：1600×900 固定舞台 + 双层 canvas + DOM 场景层 + HUD 常驻层 + 覆盖层（闪白/黑场/暗角/颗粒）
- **时间轴原语**：`seg(t,a,b)` / `lerp` / `easeOut` / `back` / `wave`，全部动画都由这几个函数组合
- **逐帧验收**：它自己就是用 `tools/qa-frames.mjs` 的前身流程验收的，抓出并修掉 6 个真问题

## 拿它当脚手架

```bash
# 起个静态服务
python -m http.server 5299

# 机器验收（会自动识别 window.__tl，按 7 个场景各取一帧）
npm run qa:frames -- --url http://127.0.0.1:5299/examples/reference/light-lag.html --sheet

# 语法门禁
npm run lint:html -- examples/reference/light-lag.html
```

改它的时候注意：`examples/reference/` 下的文件**已通过验收**，改动请另存副本，
别让参考实现处于「半改」状态。
