# srt-film

贴入字幕（SRT），得到一部逐拍演出的片子。浏览器内 GSAP 播放，可导出 MP4。

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
![typescript](https://img.shields.io/badge/typescript-5.5-blue)
![vite](https://img.shields.io/badge/vite-5.4-purple)
![node](https://img.shields.io/badge/node-%E2%89%A518-green)

> **姊妹项目** — Agent 侧的 Python 实现见
> [`srt-media-director`](https://github.com/sangbiaolaoda-arch/srt-media-director)
> （110 套排版蓝图 / Visual DSL / 可验证渲染闭环）。
> 本仓库是**浏览器内运行的 TypeScript 参考实现**：零后端、打开页面即用、播放与导出同源。

三条核心理念：

1. **诚实约束** — 画面里出现的每个数字都必须能在旁白原文中找到，机器门禁强制执行，违规则拒绝播放。
2. **逐拍导演稿** — 每拍一个画面。自动规划可以被导演覆写，覆写永远优先。
3. **机器门禁** — 违反诚实约束或安全区（headline 显示宽度 > 16）即构建失败，不静默降级。

## 用法

```bash
npm install
npm run dev        # 打开浏览器
```

左侧贴入 SRT → 「载入并规划」→ 播放 / 拖动进度条 / 点击拍列表跳转 → 「导出 MP4」。

## 导演覆写

key 为拍序号（从 1 开始）：

```json
{
  "4": { "headline": "更短的标题", "layout": "number", "bigNumber": "120毫秒", "source": "耗时120毫秒" }
}
```

- `layout`: `statement`（大字陈述）/ `number`（数字焦点）/ `contrast`（左右对照）
- 覆写 `bigNumber` 时必须给 `source`（包含该数字的原文片段），否则门禁拒绝
- 样例：`examples/01-overrides.json`

## 分拍规则（可解释，无黑箱）

1. cue 以句末标点（。！？!?…）收尾 → 收拍
2. 拍时长 ≥ 6 秒且 cue 以停顿标点收尾 → 收拍
3. cue 间隔 > 0.5 秒 → 换景收拍
4. 拍正文 ≥ 28 字 → 按 cue 边界硬切

## 测试与检查

```bash
npm test           # vitest
npm run check      # tsc + vitest
```
