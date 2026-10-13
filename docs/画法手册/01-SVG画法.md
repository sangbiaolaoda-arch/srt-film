# SVG 画法手册

所有片段可直接粘进 HTML 文件在浏览器打开。语法围栏统一用 `html` / `svg`。

---

## 1. 坐标系与 viewBox

### T01 最小可运行骨架

画一个圆角矩形。关键点：`xmlns` 在独立 `.svg` 文件里必需，内联进 HTML 时可省略；`width/height` 定视口，`viewBox` 定用户坐标系。

```html
<svg width="200" height="120" viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="10" width="180" height="100" rx="15" ry="15" fill="#6e40aa" />
</svg>
```

**什么时候用**：任何 SVG 的起手模板。

---

### T02 视口（viewport）与初始坐标系

`width` / `height` 定义**视口**——一块有限的可视窗口，画布（概念上无限大）超出视口的部分被裁掉。不带单位的值是「用户单位」，1 用户单位 = 1 px。支持的 `em ex px pt pc cm mm in %`。

建立视口时同时建立两套初始坐标系，且二者重合：

- **视口坐标系**：原点在视口左上角 `(0,0)`，x 向右、y 向下，1 单位 = 1 像素（类似 HTML 的 CSS 盒模型坐标系）。
- **用户坐标系**：建立在 SVG 画布上，初始与视口坐标系相同。`viewBox` 改的就是它——改完后它叫**当前坐标系 / user space in use**。

**什么时候用**：理解为什么「y 越大越靠下」、以及为什么改 `viewBox` 会影响所有子元素的位置。

---

### T03 viewBox 四参数

`viewBox = <min-x> <min-y> <width> <height>`

- `<min-x> <min-y>`：视口内显示区域（viewBox）的左上角。
- `width height`：该区域的宽高，**不必等于**外层 `<svg>` 的 `width/height`。
- `width` 或 `height` 为负无效；为 `0` 则该元素不渲染。

`viewBox="0 0 400 300"` 配上 `width="800" height="600"` 时，效果等价于：把画布裁到 `(0,0)-(400,300)` 这块，再**放大**填满 800×600 视口——1 用户单位 = 2 视口单位。

```html
<svg width="800" height="600" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="400" height="300" fill="#1ddea3" />
  <circle cx="200" cy="150" r="100" fill="#6e40aa" />
</svg>
```

**什么时候用**：想让图形随容器缩放而不失真——固定 `viewBox` 为设计稿坐标，`width` 交给 CSS。

---

### T04 min-x / min-y 的平移效应

非零的 `<min-x>` / `<min-y>` 等价于对图形做一次 `transform="translate(-minx -miny)"`：把内容往左上推。

```svg
<!-- viewBox 原点在 (100,100)：图形整体向左上平移 100 单位 -->
<svg width="800" height="600" viewBox="100 100 200 150" xmlns="http://www.w3.org/2000/svg">
  <rect x="100" y="100" width="200" height="150" fill="#1ddea3" />
</svg>
```

负值则反向（`viewBox="-100 -100 400 300"` 相当于 `translate(100 100)`，图形向右下移）。

**关键点**：viewBox 自动产生的变换**不影响**该元素自身的 `x/y/width/height`——这些属性仍按变换前的坐标系取值。但它会为所有属性和后代元素**建立新的坐标系**。

**什么时候用**：想让某个局部区域成为绘制原点/需要微调构图偏移时。

---

### T05 preserveAspectRatio：对齐与裁剪

当 viewBox 宽高比 ≠ 视口宽高比时，默认**不会拉变形**，而是等比缩放并居中，这就是 `preserveAspectRatio` 的默认值 `xMidYMid meet`。

语法：`preserveAspectRatio = defer? <align> <meetOrSlice>?`

- `defer`：仅用于 `<image>`，其它元素忽略。
- `<align>`：`none` 或九个值之一。
- `meetOrSlice`：`meet`（默认）或 `slice`。

`meet` ≈ `background-size: contain`（完整看见 viewBox，可能留白）；`slice` ≈ `background-size: cover`（铺满视口，viewBox 被裁掉一部分）。

九个 align 值（都强制等比缩放）：

| 值 | 等价于 background-position |
| --- | --- |
| `xMinYMin` | `0% 0%` |
| `xMinYMid` | `0% 50%` |
| `xMinYMax` | `0% 100%` |
| `xMidYMin` | `50% 0%` |
| `xMidYMid`（默认） | `50% 50%` |
| `xMidYMax` | `50% 100%` |
| `xMaxYMin` | `100% 0%` |
| `xMaxYMid` | `100% 50%` |
| `xMaxYMax` | `100% 100%` |

对比 `meet` 与 `slice`（视口 400×200、viewBox 200×200，宽高比不同）：

```html
<!-- meet：图形完整可见，左右留白，居中 -->
<svg width="400" height="200" viewBox="0 0 200 200"
     preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
  <circle cx="100" cy="100" r="90" fill="#4c6edb" />
</svg>
```

```html
<!-- slice：铺满视口，上下被裁掉，居中 -->
<svg width="400" height="200" viewBox="0 0 200 200"
     preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
  <circle cx="100" cy="100" r="90" fill="#4c6edb" />
</svg>
```

`align="none"` 才允许非等比拉伸（变变形），此时 `meetOrSlice` 被忽略。

**注意**：`mid-x/mid-y/max-x/max-y` 这几个对齐参考轴会随 `<min-x>/<min-y>` 改变。

**什么时候用**：封面/背景图想铺满裁切 → `slice`；图标/插画想完整显示 → `meet`。

---

### T06 嵌套 `<svg>` 的 x / y 陷阱（真坑）

嵌套 `<svg>` 会**建立新的视口**（新的 viewport + 用户坐标系），而它自身在父坐标系里的位置由 `x` / `y` 决定。

**坑**：`x` / `y` 的默认值是 `0`。不写 `x/y`，内层 svg 永远画在**父级原点**，而不是「跟着父元素内容流走」。

```html
<svg width="300" height="200" viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg">
  <!-- 正确：用 x/y 把内层视口摆到 (100,50) -->
  <svg x="100" y="50" width="80" height="80" viewBox="0 0 10 10">
    <circle cx="5" cy="5" r="5" fill="tomato" />
  </svg>

  <!-- 错误示范：不写 x/y，这个红方块会贴在 (0,0) 覆盖在父级左上角 -->
  <svg width="40" height="40" viewBox="0 0 10 10">
    <rect width="10" height="10" fill="gold" />
  </svg>
</svg>
```

要点：
- 内层 `x/y/width/height` 用**父级用户单位**；内层内容用自己的 `viewBox` 单位。
- 内层视口默认 `overflow: hidden`，超出部分被裁。
- 想在内层里加内边距/占位，靠 `x/y` 位移，不能靠 `margin`。
- 内层 svg 不写 `viewBox` 时，其用户坐标系与自己的视口重合（原点在自己左上角）。
- `<symbol>` + `<use>` 是更干净的可复用做法，可以规避多个内层 svg 各自坐标系的心智负担。

**什么时候用**：在一张大图里嵌入一个独立坐标系的小图（走马灯、徽章、局部缩放窗口）。

---

### T07 用 CSS 控制尺寸与几何属性（SVG 2）

`width: 100%` 让视口随容器流动，此时无论 `viewBox` 多少都会被映射到计算后的外框宽度。

```html
<svg viewBox="0 0 100 100" style="display:block; width:100%; height:auto;"
     xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="100" height="100" fill="#24aad8" />
</svg>
```

SVG 2 把一批「几何属性」升格为 CSS 属性，可写进样式表：

| SVG 元素 | 可用 CSS 几何属性 |
| --- | --- |
| `<circle>` | `cx` `cy` `r` |
| `<ellipse>` | `cx` `cy` `rx` `ry` |
| `<rect>` | `x` `y` `width` `height` `rx` `ry` |
| `<path>` | `d`（用 `path()`） |
| `<image>` | `x` `y` `width` `height` |
| `<foreignObject>` | `x` `y` `width` `height` |
| `<svg>` | `x` `y` `width` `height` |

```html
<svg width="170" height="170" xmlns="http://www.w3.org/2000/svg">
  <rect />
  <style>
    rect { x: 10; y: 10; width: 150; height: 150; fill: #6e40aa; }
  </style>
</svg>
```

**注意**：`<circle>` 支持 `cx/cy/r` 但不支持 `rx/ry`；几何属性由 CSS 控制是 SVG 2 特性，Blink/WebKit 支持较好，上生产前先验证目标浏览器。

**什么时候用**：想让同一份 SVG 用媒体查询/主题变量改尺寸与坐标。

---

## 2. 路径语法速查表

`<path>` 的 `d` 属性是一串绘图命令。**大写 = 绝对坐标，小写 = 相对上一点的增量**。

### T08 直线命令 M / L / H / V / Z

```
M x y        m dx dy          移到 (x,y)，不画线
L x y        l dx dy          从当前点画直线到 (x,y)
H x          h dx             水平线到 x
V y          v dy             垂直线到 y
Z            z                闭合子路径（大小写无差别）
```

要点：
- `M` 后**可跟多组坐标**：第一组只移动光标，之后每组都当 `L` 画线。`M 10 10 90 10 90 90` ≡ `M 10 10 L 90 10 L 90 90`；小写 `m` 同理。
- `Z` 从当前点画直线回**子路径起点**（上一个 `Z` 之后的第一点，否则整个路径的第一点），并闭合接头。
- `H/V` 只吃一个参数（只朝一个方向动）。

用 `H/V/Z` 画 80×80 方框（起点 `(10,10)`）：

```svg
<path d="M 10 10 H 90 V 90 H 10 Z" fill="#1ddea3" />
```

同一方框的**相对**写法（`m` 先移到起点，再全靠增量）：

```svg
<path d="m 10 10 h 80 v 80 h -80 z" fill="#1ddea3" />
```

**什么时候用**：矩形/直角折线/图标轮廓。纯方框用 `<rect>`/`<polygon>` 也行，二者在渲染上无性能优劣差别。

---

### T09 三次贝塞尔 C / S

```
C x1 y1, x2 y2, x y      c dx1 dy1, dx2 dy2, dx dy
S x2 y2, x y             s dx2 dy2, dx dy
```

- `C`：两控制点 `(x1,y1)`、`(x2,y2)` + 终点 `(x,y)`。曲线**出发方向**朝第一控制点，**到达方向**沿第二控制点。
- `S`：只给第二控制点 + 终点。若紧跟在 `C` 或 `S` 之后，第一控制点自动取「上一控制点关于当前点的镜像」，保证斜率连续；否则第一控制点 = 当前点。

```svg
<path d="M 20 80 C 40 20, 100 20, 120 80 S 200 140, 220 80"
      fill="none" stroke="#6e40aa" stroke-width="4" stroke-linecap="round" />
```

**什么时候用**：画平滑曲线、手绘风格线条、字母轮廓。`S` 用于把多段曲线串成一条连续平滑波。

---

### T10 二次贝塞尔 Q / T

```
Q x1 y1, x y       q dx1 dy1, dx dy
T x y              t dx dy
```

- `Q`：一个控制点 + 终点。
- `T`：只给终点，控制点由上一 `Q/T` 的控制点镜像推出；若前一条命令不是 `Q/T`，则退化成画直线。
- **相对形式的注意点**：`q` 的 `dx dy` 相对**上一个点**，不是相对 `dx1 dy1`。

```svg
<path d="M 20 80 Q 70 10, 120 80 T 220 80"
      fill="none" stroke="#24aad8" stroke-width="4" />
```

**什么时候用**：需要对称的抛物线状曲线；比 `C` 少一个控制点，够用就用它。

---

### T11 圆弧 A：7 个参数逐个说

```
A rx ry x-axis-rotation large-arc-flag sweep-flag x y
a rx ry x-axis-rotation large-arc-flag sweep-flag dx dy
```

| 位置 | 参数 | 含义 |
| --- | --- | --- |
| 1 | `rx` | 椭圆 x 半径 |
| 2 | `ry` | 椭圆 y 半径 |
| 3 | `x-axis-rotation` | 椭圆相对当前坐标系的旋转角（度） |
| 4 | `large-arc-flag` | `0` 取小弧（≤180°），`1` 取大弧（>180°） |
| 5 | `sweep-flag` | `0`/`1` 决定绕哪条弧、以正角还是负角方向走 |
| 6 | `x` / `dx` | 终点 x（相对写法为增量） |
| 7 | `y` / `dy` | 终点 y（相对写法为增量） |

为什么需要 flag：给定起点、终点和两个半径，**最多有两种椭圆**，每种椭圆上又有**两条**可走的弧 → 一共 4 条候选弧。`large-arc-flag` 选长短，`sweep-flag` 选方向。

常见误区：
- **整圆不能用一条 `A` 画**：起终点重合 → 可选椭圆无穷多 → 路径未定义。用两段半圆拼接，或直接用 `<circle>`。
- 起终点距离超过半径能到达的范围时，半径会被**自动放大**到刚好够到。
- `x-axis-rotation` 会影响半径方向：半径取 `30/50`、旋转 `-45°` 时，椭圆长轴会对齐路径方向。

```html
<!-- 一段半圆弧：从 (20,100) 到 (180,100)，半径 80 -->
<svg width="200" height="120" viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg">
  <path d="M 20 100 A 80 80 0 0 1 180 100"
        fill="none" stroke="#1ddea3" stroke-width="4" />
</svg>
```

```svg
<!-- 扇形/饼图切片：大弧 + 闭合到圆心 -->
<path d="M 100 100 L 100 20 A 80 80 0 0 1 180 100 Z" fill="#4c6edb" />
```

**什么时候用**：圆弧、圆角过渡、饼图切片、进度环。别用它画整圆。

---

### T12 用 CSS 的 d: path() 做形状变形（morph）

把 `d` 当 CSS 属性写，并按相同命令结构在状态间切换即可过渡。**两条路径的命令类型与点数必须一致**，否则不插值。

```html
<svg height="220" width="300" xmlns="http://www.w3.org/2000/svg">
  <path />
  <style>
    path {
      d: path("M150 10 L40 200 L260 200 Z");   /* 三角形 */
      fill: #4c6edb;
      transition: d 0.35s ease;
    }
    path:active {
      d: path("M150 10 L40 120 L260 120 Z");   /* 压扁的三角 */
    }
  </style>
</svg>
```

**什么时候用**：图标 hover 变形、加载动画。上生产前验证浏览器对 `d: path()` 过渡的支持。

---

## 3. 渐变与图案

渐变/图案定义在 `<defs>` 里，用 `fill="url(#id)"` 或 `stroke="url(#id)"` 引用。

### T13 linearGradient：方向由两点决定

`x1/y1 → x2/y2` 定义渐变走的直线。**默认水平**（左→右）；设成 `x1=0 x2=0 y1=0 y2=1` 即为垂直。`<stop>` 的 `offset` 必须从 `0%` 递增到 `100%`（或 `0`→`1`）；重复 offset 时取 XML 树中靠后的那个。

```html
<svg width="120" height="240" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="Gradient1">
      <stop class="stop1" offset="0%" />
      <stop class="stop2" offset="50%" />
      <stop class="stop3" offset="100%" />
    </linearGradient>
    <linearGradient id="Gradient2" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="red" />
      <stop offset="50%" stop-color="black" stop-opacity="0" />
      <stop offset="100%" stop-color="blue" />
    </linearGradient>
  </defs>
  <style>
    #rect1 { fill: url("#Gradient1"); }
    .stop1 { stop-color: red; }
    .stop2 { stop-color: black; stop-opacity: 0; }
    .stop3 { stop-color: blue; }
  </style>

  <rect id="rect1" x="10" y="10" rx="15" ry="15" width="100" height="100" />
  <rect x="10" y="120" rx="15" ry="15" width="100" height="100" fill="url(#Gradient2)" />
</svg>
```

`stop-color` / `stop-opacity` 既可写属性也可走 CSS 类。

**什么时候用**：按钮底色、按钮边框、文字渐变、图例色带。

---

### T14 用 href 复用渐变的 stop 定义

一个渐变可以继承另一个渐变的属性和 stops，不必重复写。

```svg
<linearGradient id="Gradient1">
  <stop id="stop1" offset="0%" />
  <stop id="stop2" offset="50%" />
  <stop id="stop3" offset="100%" />
</linearGradient>
<linearGradient id="Gradient2" x1="0" x2="0" y1="0" y2="1" href="#Gradient1" />
```

**什么时候用**：同一套配色要多方向/多尺寸复用。

---

### T15 radialGradient：中心与焦点

用两个「点」定义：**结束圆**（`cx cy r`）和**焦点**（`fx fy`，渐变最里层颜色的位置）。不写 `fx/fy` 时默认与 `cx/cy` 重合；焦点若跑到圆外，会被夹到圆边缘。

```html
<svg width="120" height="120" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="Gradient" cx="0.5" cy="0.5" r="0.5" fx="0.25" fy="0.25">
      <stop offset="0%" stop-color="red" />
      <stop offset="100%" stop-color="blue" />
    </radialGradient>
  </defs>
  <rect x="10" y="10" rx="15" ry="15" width="100" height="100" fill="url(#Gradient)" />
</svg>
```

**什么时候用**：球体高光、聚光灯感、金属质感。

---

### T16 spreadMethod：渐变走完之后的填充方式

三种取值：

- `pad`（默认）：用末端 offset 的颜色填满剩余区域。
- `reflect`：以末端颜色为界**镜像反射**继续，来回往复。
- `repeat`：跳回起点重新跑一遍。

```html
<svg width="220" height="220" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="Pad" cx="0.5" cy="0.5" r="0.4" fx="0.75" fy="0.75" spreadMethod="pad">
      <stop offset="0%" stop-color="red" /><stop offset="100%" stop-color="blue" />
    </radialGradient>
    <radialGradient id="Repeat" cx="0.5" cy="0.5" r="0.4" fx="0.75" fy="0.75" spreadMethod="repeat">
      <stop offset="0%" stop-color="red" /><stop offset="100%" stop-color="blue" />
    </radialGradient>
    <radialGradient id="Reflect" cx="0.5" cy="0.5" r="0.4" fx="0.75" fy="0.75" spreadMethod="reflect">
      <stop offset="0%" stop-color="red" /><stop offset="100%" stop-color="blue" />
    </radialGradient>
  </defs>
  <rect x="10" y="10" width="100" height="100" fill="url(#Pad)" />
  <rect x="10" y="120" width="100" height="100" fill="url(#Repeat)" />
  <rect x="120" y="120" width="100" height="100" fill="url(#Reflect)" />
</svg>
```

**什么时候用**：条纹/波纹底纹、荧光灯管、多段循环色带。

---

### T17 gradientUnits：userSpaceOnUse vs objectBoundingBox

- `objectBoundingBox`（**默认**）：坐标系是元素包围盒，取值 `0~1`，自动按元素尺寸缩放——不用关心元素多大。
- `userSpaceOnUse`：用绝对用户单位，必须知道元素在画布上的实际位置，把渐变摆到同样位置。

上面的 radial 若改成 userSpaceOnUse：

```svg
<radialGradient id="Gradient" cx="60" cy="60" r="50" fx="35" fy="35"
                gradientUnits="userSpaceOnUse">
  <stop offset="0%" stop-color="red" />
  <stop offset="100%" stop-color="blue" />
</radialGradient>
```

选型：
- 元素尺寸未知/要自适应 → `objectBoundingBox`。
- 多个元素共用一条贯穿画布的渐变，或想要绝对定位 → `userSpaceOnUse`。

**额外**：`gradientTransform` 可再对渐变做一次矩阵变换（平移/旋转/缩放）；注意 `objectBoundingBox` 在包围盒非正方形时会有额外坑。

**什么时候用**：决定渐变「跟着元素走」还是「钉在画布上」。

---

### T18 pattern：瓷砖/底纹

`<pattern>` 里的内容被当作一块「瓷砖」，按 `width`/`height` 平铺。`patternUnits` 决定瓷砖尺寸的单位：

- `userSpaceOnUse`（**默认**）：瓷砖宽高用用户单位。
- `objectBoundingBox`：瓷砖宽高是相对被填充元素包围盒的比例。

`patternContentUnits` 决定瓷砖**内部内容**的坐标单位（默认 `userSpaceOnUse`）。`patternTransform` 可对整块瓷砖做矩阵变换。

```html
<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
      <circle cx="10" cy="10" r="4" fill="#1ddea3" />
    </pattern>
  </defs>
  <rect x="0" y="0" width="200" height="200" fill="url(#dots)" />
</svg>
```

**什么时候用**：网点/斜纹/棋盘底纹、便签纸网格、重复的装饰纹样。

---

### T19 坑：渐变/图案/裁剪的 `id` 与 `url(#id)` 在多实例共存时冲突

`fill="url(#Gradient1)"`、`mask="url(#m1)"`、`clip-path="url(#c1)"` 都靠**文档级唯一 id** 引用。把同一份带固定 id 的 SVG 内联两次（或组件复用、或列表渲染多份），会出现：

- 文档里出现**重复 id**，`url(#id)` 一律解析到**第一个**匹配项 → 后渲染的实例可能用错渐变/遮罩，或看起来「没生效」；
- 若其中一个实例被隐藏/移除，引用它的另一个实例可能直接丢掉填充或整块消失。

规避方式：

- 每个实例渲染前**给 id 加唯一后缀**（如组件实例 uid）：`id="grad-{{uid}}"` / `fill="url(#grad-{{uid}})"`。
- 或改用 CSS 变量 / 外部 `currentColor` 传色，避免靠 id 引用。
- 或用 `<use href>` + `<symbol>`（外部引用）时仍需保证 id 唯一。
- 纯 CSS 里**不要**用 `#id` 选择器做实例隔离，重复 id 下也会错。

**什么时候用**：组件化把 SVG 当图标/模板复用时，先检查是否有重复 id。这是最常见的「本地单独打开正常、页面里多份就乱」的根因。

---

## 4. 裁剪与遮罩

### T20 clip 与 mask 的本质区别

- **裁剪（clip）**：永远是**矢量路径**。路径内可见、路径外透明，边缘是**硬**的（抗锯齿之外无过渡）。
- **遮罩（mask）**：是一张**图像/渐变**，按亮度或 alpha 取值的**软**过渡。黑→透明、白→不透明（luminance 模式）。

`clip` 属性已废弃（只能配合绝对定位、只能矩形），用 `clip-path` 代替。注意 `clip-path: rect(...)` **不可用**，矩形要用 `inset()`。

**什么时候用**：要硬边异形轮廓 → clip；要羽化/渐隐/软过渡 → mask。

---

### T21 CSS clip-path 四种基本形状 + path()

```html
<style>
  .inset   { clip-path: inset(10px 20px 30px 40px); }      /* 上 右 下 左，无逗号 */
  .inset1  { clip-path: inset(10% ); }                     /* 可单值/2值(纵横)/3值(上横下) */
  .circle  { clip-path: circle(60px at center); }
  .ellipse { clip-path: ellipse(60px 40px at 75px 30px); }
  .polygon { clip-path: polygon(5% 5%, 100% 0%, 100% 75%, 75% 75%, 75% 100%, 50% 75%, 0% 75%); }
  .path    { clip-path: path("M0,0 L100,0 L100,100 L0,100 Z"); }  /* 任意路径，注意是 px 坐标系 */
</style>
```

要点：
- `inset()` 用空格分隔、**无逗号**；`circle()` / `ellipse()` / `polygon()` 用逗号分组。
- `polygon()` 接受 `px` 或 `%`，是最强的基本形状。
- `path()` 用绝对像素坐标，不随元素尺寸自适应——要随尺寸变化优先用 `polygon()` + 百分比。

**什么时候用**：给 img/div 做斜切、气泡、多边形头像框。

---

### T22 引用 SVG `<clipPath>` 做任意形状裁剪

`<clipPath>` 内可放基本图形、`<path>`、`<text>`，会取**并集**：所有形状合起来构成可见区。

```html
<img src="photo.jpg" class="clip-svg" alt="" />

<svg width="0" height="0" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="myClip">
      <circle cx="100" cy="100" r="40" />
      <circle cx="60"  cy="60"  r="40" />
    </clipPath>
  </defs>
</svg>

<style>
  .clip-svg { clip-path: url(#myClip); }
</style>
```

用文字做裁剪（文字底下透出内容）：

```svg
<clipPath id="textClip">
  <text x="0" y="300" textLength="800px" lengthAdjust="spacing"
        font-family="Vollkorn" font-size="230px" font-weight="700" font-style="italic">
    Blossom
  </text>
</clipPath>
```

文字裁剪时 `x/y` 定位的是**文字基线左端**（y 是 baseline）。可以拿这段 clip 去裁图片、动图甚至视频。

**什么时候用**：任意不规则形状、文字镂空图、多形状合成遮罩。

---

### T23 clipPathUnits：坐标系

- `userSpaceOnUse`（**默认**）：`<clipPath>` 内容用「引用它的那个元素当前所在」的用户坐标系。
- `objectBoundingBox`：原点在被裁剪元素包围盒左上角，**内容坐标必须落在 `0~1`**（分数即百分比）。适合让裁剪自动贴合元素尺寸。

```svg
<!-- 圆心落在元素中心：用分数表示，元素变大也居中 -->
<clipPath id="centerDot" clipPathUnits="objectBoundingBox">
  <circle cx="0.5" cy="0.5" r="0.25" />
</clipPath>
```

注意：对 HTML 元素，引用框是 border box；对 SVG 元素，`objectBoundingBox` 用的是元素几何包围盒。

**什么时候用**：一份裁剪要套在不同尺寸的元素上。

---

### T24 clipPath 内容的两条硬限制

1. **不能放 `<g>` 分组**：一旦 `<clipPath>` 里出现 `<g>`，整个裁剪会失效（图形不再被裁）。
2. `<use>` 只能引用**简单图形**（circle/rect/path 等），不能引用分组。

正确写法是把多个图形**平铺**列进 `<clipPath>`：

```svg
<clipPath id="svgPath">
  <circle cx="50" cy="50" r="40" />
  <circle cx="193.949" cy="235" r="74.576" />
  <circle cx="426.576" cy="108.305" r="47.034" />
</clipPath>
```

**什么时候用**：写多形状裁剪时，别为了「整齐」把它们包进 `<g>`。

---

### T25 clip-path 的附加行为（堆叠上下文 / 指针事件 / 动画 / 空裁剪）

- **堆叠上下文**：`clip-path` 取任何**非 `none`** 的值，都会让该元素像 `opacity` 那样新建堆叠上下文。
- **指针事件**：被裁掉的不可见区域**不接收**指针事件（命中测试只认可见区）。Firefox、以及 Chrome 对 SVG 元素均为此行为。
- **空裁剪**：`<clipPath>` 内容为空时，元素会被**完全裁掉**（全部消失）。
- **动画**：
  - 基本形状（`polygon()` 等）可用 CSS `transition`/`animation` 平滑变形（命令结构需一致）。
  - `<clipPath>` 引用型（`url(#…)`）**不能**用 CSS 平滑过渡；要动就在 `<clipPath>` 内用 SMIL（`<animate>` 等）动 `r`、`transform` 等。

```html
<style>
  .tri {
    transition: clip-path 0.4s cubic-bezier(1, -1, 0, 2);
    clip-path: polygon(50% 5%, 0% 100%, 100% 100%);
  }
  .tri:hover { clip-path: polygon(50% 19%, 0 76%, 100% 76%); }
</style>
```

**什么时候用**：做裁剪过渡动画先确认是「基本形状」还是「url 引用」，后者走 SMIL。

---

### T26 mask：luminance 与 alpha 两种模式

`<mask>` 里放白→黑的渐变或图形，元素按遮罩的**亮度或 alpha** 决定可见度。

- `mask-type: luminance`（SVG `<mask>` 默认）：**白 = 完全显示，黑 = 完全隐藏，灰 = 半透明**。用亮度当透明度。
- `mask-type: alpha`（CSS `mask-image` 默认）：按 **alpha 通道**。不透明处显示、透明处隐藏；此时遮罩图颜色无关紧要。

（提醒：把「fade in」遮罩做成黑白渐变时，**白端是显示的那一端**，别搞反。）

```html
<svg width="200" height="120" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fadeGrad">
      <stop offset="0" stop-color="#fff" />
      <stop offset="1" stop-color="#000" />
    </linearGradient>
    <mask id="fade" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="120">
      <rect x="0" y="0" width="200" height="120" fill="url(#fadeGrad)" />
    </mask>
  </defs>
  <rect x="0" y="0" width="200" height="120" fill="#6e40aa" mask="url(#fade)" />
</svg>
```

CSS 侧写法（可遮 HTML 元素）：

```css
.fade {
  -webkit-mask-image: linear-gradient(#000, transparent);
          mask-image: linear-gradient(#000, transparent);
}
```

要点：
- `mask-type` 可用 CSS 设置；`mask` 可引用 SVG `<mask>`，也可直接 `mask: url(mask.svg)`。
- 与 clip 一样，遮罩**只影响渲染**，不改变元素几何——周边内容仍按矩形对待它。

**什么时候用**：渐隐蒙层、边缘羽化、柔光、不规则软边缘、把任意内容「擦除」成渐变消失。

---

## 5. 用 CSS 控制 SVG

### T27 哪些 SVG 属性可以当 CSS 属性用

可以当 CSS 的只有 **presentation attributes**（表现属性）。元素按类别分：

| 类别 | 元素 |
| --- | --- |
| 容器 | `<a>` `<defs>` `<g>` `<marker>` `<mask>` `<pattern>` `<svg>` `<switch>` `<symbol>` |
| 滤镜基元 | `<fe*>` 系列 |
| 渐变 | `<linearGradient>` `<radialGradient>` `<stop>` |
| 图形 | `<circle>` `<ellipse>` `<image>` `<line>` `<path>` `<polygon>` `<polyline>` `<rect>` `<text>` `<use>` |
| 文本内容 | `<text>` `<textPath>` `<tspan>` |

常用可 CSS 化的属性（按类别）：

- 填充/描边（作用于图形、文本内容元素）：`fill` `fill-opacity` `fill-rule` `stroke` `stroke-width` `stroke-opacity` `stroke-linecap` `stroke-linejoin` `stroke-miterlimit` `stroke-dasharray` `stroke-dashoffset` `marker` `marker-start/mid/end` `shape-rendering` `paint-order`
- 渐变：`stop-color` `stop-opacity`（作用于 `<stop>`）
- 滤镜：`flood-color` `flood-opacity` `lighting-color` `color-interpolation-filters`
- 裁剪/遮罩：`clip` `clip-path`（容器+图形元素）`clip-rule`（`<clipPath>`）`mask`（容器+图形元素）`opacity`
- 可见性：`display`（图形/文本/`<a>`/`<foreignObject>`/`<g>`/`<svg>`/`<switch>`）`visibility`
- 颜色：`color`（供 `fill`/`stroke`/`stop-color`/`flood-color`/`lighting-color` 取 `currentColor`）
- 交互：`cursor`、`pointer-events`
- 文本：`font-*` `text-anchor` `dominant-baseline` `alignment-baseline` `baseline-shift` `letter-spacing` `word-spacing` `writing-mode` `direction` `text-rendering`
- 几何（SVG 2）：`cx cy r rx ry x y width height d(path)`

```html
<svg width="120" height="120" xmlns="http://www.w3.org/2000/svg">
  <circle cx="60" cy="60" r="40" />
  <style>circle { fill: red; stroke: #000; stroke-width: 3; }</style>
</svg>
```

**什么时候用**：需要 hover/focus/媒体查询/主题变量改样式时。

---

### T28 哪些能过渡/动画，哪些不能

**能平滑过渡/动画**（有连续数值或颜色语义）：

- `fill` / `stroke` 的**颜色值**、`fill-opacity` / `stroke-opacity`、`opacity`
- `stroke-width` `stroke-dasharray` `stroke-dashoffset`
- `stop-color` / `stop-opacity`（在 `<stop>` 上）
- SVG 2 几何属性：`r` `cx` `cy` `rx` `ry` `x` `y` `width` `height`
- `d`（用 CSS `path()`，且两端命令结构一致）
- `transform`（配合 `transform-origin` / `transform-box`）

**不能或受限**：

- **`url(#id)` 引用型**：`fill: url(#grad)` 与另一个 url 之间无法平滑插值；要动渐变颜色就动 `<stop>` 的 `stop-color`。
- 没有 CSS 对应物的属性：`viewBox` `preserveAspectRatio`（用 JS 或 SMIL）。
- 用 `d` **属性**（而非 CSS `d`）写的路径数据不能靠 CSS keyframes 变形。
- `<clipPath>` 的 `url()` 引用不能 CSS 过渡（见 T25）。
- 跨浏览器支持参差：几何属性动画依赖 SVG 2 实现，上线前先测。

**什么时候用**：写动画前先确认目标属性在「能」这一列，否则改用 SMIL 或 JS。

---

## 6. 描边与端点

### T29 stroke-dasharray / stroke-dashoffset：线条生长动画

原理：`stroke-dasharray` 把描边切成「虚线」。若让一段实线长度 = 整条路径长度 `L`，其余为空白（`dasharray = L L`），再把 `stroke-dashoffset` 从 `L` 动到 `0`，视觉效果就是线条**从起点长到终点**。

公式：
1. `dasharray = L L`（或直接 `L`），把整条路径包成一段「实线 + 等长空白」。
2. 初态 `dashoffset = L`（整段线被空档盖住 → 看不见）。
3. 末态 `dashoffset = 0`（实线全部露出 → 画满）。
4. `L` 由 `getTotalLength()` 取，或用属性 `pathLength="1"` 归一化，把 `L` 当作 `1`，省去量长。

**省事写法（pathLength 归一化 + CSS 动画，路径多长都通用）**：

```html
<svg width="300" height="100" viewBox="0 0 300 100" xmlns="http://www.w3.org/2000/svg">
  <path class="grow"
        pathLength="1"
        d="M 20 50 C 80 0, 220 100, 280 50"
        fill="none" stroke="#6e40aa" stroke-width="4" stroke-linecap="round" />
  <style>
    .grow {
      stroke-dasharray: 1;
      stroke-dashoffset: 1;
      animation: draw 2s ease forwards;
    }
    @keyframes draw { to { stroke-dashoffset: 0; } }
  </style>
</svg>
```

**自包含写法（SMIL，不依赖 CSS，长度写死也没关系）**：

```html
<svg width="300" height="100" viewBox="0 0 300 100" xmlns="http://www.w3.org/2000/svg">
  <path d="M 20 50 C 80 0, 220 100, 280 50"
        fill="none" stroke="#1ddea3" stroke-width="4" stroke-linecap="round"
        stroke-dasharray="300" stroke-dashoffset="300">
    <animate attributeName="stroke-dashoffset" from="300" to="0"
             dur="2s" fill="freeze" />
  </path>
</svg>
```

**什么时候用**：签名动画、进度条、链路高亮、手绘线稿逐段显现。

---

### T30 stroke-linecap / stroke-linejoin / vector-effect 三个端点细节

- `stroke-linecap`：`butt`（默认，平头）/ `round` / `square`。线条生长动画想要圆头就用 `round`。
- `stroke-linejoin`：`miter`（默认尖角）/ `round` / `bevel`。尖角过长时被 `stroke-miterlimit` 截断成斜角。
- `vector-effect="non-scaling-stroke"`：让描边宽度**不受**父级/自身缩放影响，永远保持设定像素宽度（适合整体缩放时线不该变粗的场景）。

```html
<svg width="200" height="120" viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg">
  <polyline points="20,100 100,20 180,100"
            fill="none" stroke="#4c6edb" stroke-width="6"
            stroke-linecap="round" stroke-linejoin="round"
            vector-effect="non-scaling-stroke" />
</svg>
```

**什么时候用**：图标描边统一圆头；需要缩放图形但线宽恒定时加 `vector-effect`。

---

## 技法清单

| 编号 | 技法 | 小节 |
| --- | --- | --- |
| T01 | 最小可运行骨架 | 1 |
| T02 | 视口与初始坐标系 | 1 |
| T03 | viewBox 四参数 | 1 |
| T04 | min-x / min-y 平移效应 | 1 |
| T05 | preserveAspectRatio 对齐与裁剪 | 1 |
| T06 | 嵌套 `<svg>` 的 x/y 陷阱 | 1 |
| T07 | CSS 控制尺寸与几何属性（SVG 2） | 1 |
| T08 | 直线命令 M/L/H/V/Z | 2 |
| T09 | 三次贝塞尔 C/S | 2 |
| T10 | 二次贝塞尔 Q/T | 2 |
| T11 | 圆弧 A 的 7 参数 | 2 |
| T12 | CSS `d: path()` 形状变形 | 2 |
| T13 | linearGradient 方向与 stop | 3 |
| T14 | href 复用渐变 stop | 3 |
| T15 | radialGradient 中心与焦点 | 3 |
| T16 | spreadMethod | 3 |
| T17 | gradientUnits 两值对比 | 3 |
| T18 | pattern 瓷砖 | 3 |
| T19 | id / url(#id) 多实例冲突坑 | 3 |
| T20 | clip 与 mask 的本质区别 | 4 |
| T21 | CSS clip-path 四种基本形状 + path() | 4 |
| T22 | 引用 SVG `<clipPath>` 任意裁剪 | 4 |
| T23 | clipPathUnits | 4 |
| T24 | clipPath 内容硬限制（禁 `<g>`） | 4 |
| T25 | clip-path 附加行为（堆叠/指针/动画/空裁） | 4 |
| T26 | mask 的 luminance vs alpha | 4 |
| T27 | 可 CSS 化的 SVG 表现属性清单 | 5 |
| T28 | 哪些能过渡/动画，哪些不能 | 5 |
| T29 | stroke-dasharray/dashoffset 线条生长 | 6 |
| T30 | linecap/linejoin/vector-effect 端点细节 | 6 |

---

> 配套：`snippets/svg-01-viewbox-coords.html · svg-02-path-commands.html · svg-03-gradient-pattern.html · svg-04-clip-mask.html · svg-05-stroke-draw.html`
> 出处见 `00-速查总览.md` 第六节。
