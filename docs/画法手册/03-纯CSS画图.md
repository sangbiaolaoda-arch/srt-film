# 纯 CSS 画图手册（操作版）

目标：不写 SVG、不引图片，只用 HTML 元素 + CSS 声明画出图形与图案。每条技法都标注**什么时候用**和**兼容性注意点**。下面所有代码粘进一个 `.html` 里就能看效果。

约定：所有示例用 `.box` 作为画布元素，给它固定 `width/height`（或 `aspect-ratio`）后再画。

---

## 0. 心法：CSS 画图的三种"画笔"

| 画笔 | 本质 | 擅长 | 局限 |
|---|---|---|---|
| **盒模型**（border / border-radius / transform / padding） | 用边框和圆角把"矩形"改造成别的形状 | 三角形、圆、椭圆、梯形、菱形、箭头、对话泡 | 形状靠 hack，颜色只能是实色；复杂形不现实 |
| **clip-path / mask** | 剪掉不要的部分 | 任意多边形、圆、椭圆、内切矩形、任意 SVG 路径 | 只切不画；polygon 动画要求结构一致 |
| **background 渐变** | 用色标当"像素" | 条纹、棋盘、饼图、进度环、径向光斑、任意纯色图案 | 需要理解坐标/角度系统；复杂图案代码偏长 |

叠加使用才是常态：先 `background` 铺图案 → `clip-path` 剪外形 → `filter`/`box-shadow` 加光晕。

**优先顺序**：能用 `clip-path` 就别用 border hack（可读性好、能出曲线）；需要 3D 或透视细节才上 `transform`；需要贴图/纹理用渐变。
**能上 SVG 就上 SVG**：轮廓线（stroke）、任意 path、复杂图标，SVG 更干净；本文只解决"不想引额外资源"的场合。

---

## 1. 用 border / border-radius / transform 造形状

### 1.1 正方形 / 矩形 / 圆形 / 椭圆

```css
.square  { width: 100px; height: 100px; background: #3498db; }
.rect    { width: 160px; height: 100px; background: #3498db; }

.circle  { width: 100px; height: 100px; border-radius: 50%; background: #e74c3c; }

/* 椭圆：宽高不等 + 50% 圆角 */
.oval    { width: 160px; height: 100px; border-radius: 50%; background: #9b59b6; }
```

正方形也可以只写 `width` + `aspect-ratio: 1`，高度自适应，改一个值就整体缩放：

```css
.square { width: 100px; aspect-ratio: 1; background: #3498db; }
```

**什么时候用**：几乎所有图形的基础容器；圆形就是"圆角拉到 50%"。
**兼容性注意点**：`border-radius: 50%` 与 `overflow: hidden` 配合时，老 Safari 需要前缀（现代版已不需要）。`aspect-ratio` 现代浏览器全支持，IE 不支持。

### 1.2 三角形：`border` 技巧（重点，附原理图）

**原理**：给一个 `width:0; height:0` 的元素设四边都是"粗边框"时，四条边会各自收成梯形，最终在中心交汇成 **4 个三角形**。哪个方向涂色，就出哪个方向的三角形。

四边边框的形态（`border-width` 都相等时）：

```
        ▲ top
      ◤   ◥        元素宽高都是 0，
    ◀  ◢ █ ◣  ▶    四条边框各占一个"对角三角形"
      ◣   ◢        left / right / top / bottom
        ▼ bottom
```

只要把不要的三边设为 `transparent`，剩下的那一块就是一个三角形。

```css
/* 朝上的三角形：底边在下，尖角在上 */
.tri-up {
  width: 0; height: 0;
  border-left: 50px solid transparent;
  border-right: 50px solid transparent;
  border-bottom: 80px solid #e67e22; /* 有颜色的是"底边在下"那一片 */
}

/* 朝下的三角形 */
.tri-down {
  width: 0; height: 0;
  border-left: 50px solid transparent;
  border-right: 50px solid transparent;
  border-top: 80px solid #e67e22;
}

/* 朝左的三角形：尖角在左 */
.tri-left {
  width: 0; height: 0;
  border-top: 50px solid transparent;
  border-bottom: 50px solid transparent;
  border-right: 80px solid #e67e22;
}

/* 朝右的三角形 */
.tri-right {
  width: 0; height: 0;
  border-top: 50px solid transparent;
  border-bottom: 50px solid transparent;
  border-left: 80px solid #e67e22;
}
```

**记忆口诀**：想要尖朝 X，就给 **X 的对面**那条边上色。
- 尖朝上 → 涂 `border-bottom`
- 尖朝下 → 涂 `border-top`
- 尖朝左 → 涂 `border-right`
- 尖朝右 → 涂 `border-left`

**等腰 vs 直角**：`border-left/right` 宽度相等 → 等腰（尖在正中）；想让尖偏向一侧，就把对称两边的宽度设为不等。只保留相邻两边（如 `border-bottom` + `border-right`）→ 得到**直角三角**：

```css
/* 直角三角形（尖在左下），常用于角标/波形 */
.tri-rt {
  width: 0; height: 0;
  border-bottom: 60px solid #e74c3c;
  border-right: 60px solid transparent;
}
```

**什么时候用**：小指示箭头、tooltip 尖角、排序图标、进度条端头。面积小、纯实色时最好用。
**兼容性注意点**：全浏览器支持，无前缀问题。**只能实色**——`border-color` 不接受渐变、`transparent` 之外也画不出描边空心三角（要空心三角请用 `clip-path` 或 SVG）。

### 1.3 梯形 / 平行四边形 / 菱形

```css
/* 梯形：用 border 或 transform 皆可。这里用 border 版（上窄下宽） */
.trapezoid {
  width: 100px; height: 0;
  border-bottom: 60px solid #1abc9c;
  border-left: 30px solid transparent;
  border-right: 30px solid transparent;
}

/* 平行四边形：矩形斜切 */
.parallelogram {
  width: 140px; height: 60px;
  background: #1abc9c;
  transform: skewX(-20deg);
}

/* 菱形（方形旋转 45°） */
.diamond {
  width: 70px; height: 70px;
  background: #f39c12;
  transform: rotate(45deg);
}
```

`transform` 版在需要**文字/内容不倾斜**时要注意：skew 会连同子内容一起歪，此时给内层再 `skewX(20deg)` 反向抵消。

**什么时候用**：梯形做标牌/底座，平行四边形做动感卡片/按钮，菱形做标记。
**兼容性注意点**：`transform` 全支持；`skew`/`rotate` 会把子元素一起变换，需要反向变换修正。

### 1.4 心形 / 对话泡 / 箭头（伪元素组合）

伪元素 `::before` / `::after` 相当于多给你两个方块，**一个 HTML 元素能变成三块**，这是拼复杂形的关键。

```css
/* 心形：一个方块旋转 45° + 两个半圆 */
.heart {
  position: relative;
  width: 100px; height: 90px;
}
.heart::before,
.heart::after {
  content: "";
  position: absolute;
  top: 0;
  width: 50px; height: 80px;
  background: #e74c3c;
  border-radius: 50px 50px 0 0;   /* 上方两个半圆 */
  transform: rotate(-45deg);
  transform-origin: 0 100%;
}
.heart::after {
  left: 50px;
  transform: rotate(45deg);
  transform-origin: 100% 100%;
}
```

```css
/* 对话泡：圆角矩形 + 一个伪元素三角形 */
.bubble {
  position: relative;
  padding: 16px 20px;
  background: #2c3e50;
  color: #fff;
  border-radius: 12px;
}
.bubble::after {
  content: "";
  position: absolute;
  left: 24px;
  bottom: -16px;             /* 三角形贴到气泡下方 */
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 16px solid #2c3e50;
}
```

**什么时候用**：图标、装饰形、气泡、徽章。
**兼容性注意点**：伪元素必须有 `content: ""`；绝对定位需要父级 `position: relative`。心形这类拼形在需要描边或渐变时很难处理，改用 `clip-path` / SVG。

---

## 2. clip-path：剪出任意形状

`clip-path` 是**"剪"**：只保留路径内部，外部透明。比 border hack 干净、能出曲线、能定义描边感（通过叠加两层）。

### 2.1 五种基本形状的语法

```css
/* ① inset() 内切矩形：从四条边向内缩，等价于旧 clip: rect() 的现代版 */
.inset {
  clip-path: inset(10px 20px 30px 40px); /* 上 右 下 左，和 margin 同序 */
}
.inset-round {
  clip-path: inset(10px 20px round 16px); /* round 给内切矩形加圆角 */
}

/* ② circle() 圆：半径 at 圆心坐标 */
.circle {
  clip-path: circle(60px at center);      /* 也可 at 50% 50% */
}

/* ③ ellipse() 椭圆：横半径 纵半径 at 圆心 */
.ellipse {
  clip-path: ellipse(60px 40px at 75px 30px);
}

/* ④ polygon() 多边形：任意点列 */
.poly {
  clip-path: polygon(50% 0%, 100% 100%, 0% 100%); /* 三角形 */
}

/* ⑤ path() 任意 SVG 路径：坐标是绝对 px，写死尺寸 */
.path {
  clip-path: path("M 0 0 L 100 0 L 100 50 Q 50 100 0 50 Z");
}
```

**坐标逻辑**：
- `inset()` 的四值是**从对应边向内缩的距离**（上右下左，和 margin 一致）；无逗号，空格分隔。
- `circle()/ellipse()` 用 `at x y` 指定圆心，可用 `px`/`%`/关键词 `center`。半径可用 `closest-side`/`farthest-side` 等。
- `polygon()` 每个点是 `x y`（空格分隔一对），点之间用**逗号**分隔；所有坐标相对元素自身盒子（0% 左上，100% 右下）。
- `path()` 用 SVG 的 `d` 字符串语法，**只能是绝对/相对 px 坐标**（不支持百分比），所以必须知道元素尺寸。

### 2.2 polygon 百分比坐标怎么"数点"

思路：把元素想成一个坐标系，**左上角 (0%,0%)，右下角 (100%,100%)**，从左到右递增 x，从上到下递增 y。按**绘制顺序**（一般顺时针）依次写下每个顶点的 `x y`。

例：一个右上角被切掉的矩形（缺角卡片）：

```css
.cut-corner {
  /* 从左上开始，顺时针：左上 → 右上少切 40px → 右下 → 左下 */
  clip-path: polygon(0 0, calc(100% - 40px) 0, 100% 40px, 100% 100%, 0 100%);
}
```

数点技巧：
- 从**最容易定位的角**开始（通常是左上 `0 0`）。
- 每遇到一个"拐点"再加一个点。
- 想算术就用 `calc()`（百分比与 px 混用合法）。
- 上例是"右上缺角"，把 `100% 0 → 100% 40px` 这个角换成 `0 0 → 40px 0 / 100% 40px` 就变成"左上缺角"。

常用现成形状：

```css
/* 六边形（平顶） */
.hexagon {
  clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
}
/* 五角星 */
.star {
  clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%,
                     50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
}
/* 八边形 */
.octagon {
  clip-path: polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%,
                     70% 100%, 30% 100%, 0% 70%, 0% 30%);
}
```

**什么时候用**：缺角卡片、斜切面、多边形徽章、图标轮廓、图片非矩形裁切。
**兼容性注意点**：`clip-path` 现代浏览器全支持；Safari 早期需 `-webkit-clip-path`（现代版一般不需要，但做兼容可同时写）。`path()` 只认 px，元素尺寸变化会失配；响应式优先用 `polygon()`。

### 2.3 clip-path 的动画限制（重要）

**只能"同形状、同点数、同结构"之间插值**。浏览器要逐点连线做补间，形状类型或点数不一致就直接跳变（无过渡）。

```css
/* ✅ 合法：都是 polygon，且都是 3 个点 → 平滑过渡 */
div {
  clip-path: polygon(50% 5%, 0% 100%, 100% 100%);
  transition: clip-path 0.4s cubic-bezier(1, -1, 0, 2);
}
div:hover {
  clip-path: polygon(50% 19%, 0 76%, 100% 76%); /* 还是 3 点 */
}
```

```css
/* ❌ 非法：polygon(3 点) → circle()，类型不同，不会补间 */
.a { clip-path: polygon(50% 0, 100% 100%, 0 100%); transition: clip-path .4s; }
.a:hover { clip-path: circle(40% at 50% 50%); }  /* 直接切换，没有动画 */
```

| 组合 | 能否补间 |
|---|---|
| polygon → polygon（**点数相同**） | ✅ |
| circle → circle（半径/圆心变化） | ✅ |
| inset → inset（四值变化） | ✅ |
| polygon → circle | ❌ 直接跳 |
| polygon（3 点）→ polygon（4 点） | ❌ 直接跳 |
| `path()` → 其它 | ❌ 一般不补间 |

**实用技巧**：想让"三角变宽/变扁"有动画，保持点数不变，只改坐标值；想让人"剪切形状从三角变圆"，请改用**两个元素叠着做透明度交叉淡入**，或改用 `mask` + 径向渐变。

**什么时候用**：悬停展开、形状变形、页面转场。
**兼容性注意点**：点数不同的 polygon 不同步是**规范行为**，不是 bug；跨浏览器一致。过渡曲线用 `cubic-bezier` 做弹性感（如上例的 `cubic-bezier(1,-1,0,2)`）。

---

## 3. 渐变当画笔

`background` 的渐变不是"只能做底色"——把色标位置卡死（**硬中断**）就能做出任意纯色图案。一个元素可以叠多层渐变（用逗号分层，**先写的在上层**）。

### 3.1 三种渐变语法与方向/角度

```css
/* 线性：方向 或 角度 + 色标 */
.linear {
  background: linear-gradient(to right, #3498db, #e74c3c);
  /* 角度写法：0deg 指向上，顺时针增加；90deg = to right，180deg = to bottom */
  background: linear-gradient(135deg, #3498db, #e74c3c);
}

/* 径向：形状 大小 at 圆心 + 色标 */
.radial {
  background: radial-gradient(circle at 30% 30%, #fff, #3498db 70%, #1a5276);
  /* 也可 ellipse / closest-side / farthest-corner 等 */
}

/* 圆锥：from 起始角 at 圆心 + 色标（绕圈） */
.conic {
  background: conic-gradient(from 0deg at 50% 50%, #e74c3c, #f1c40f, #2ecc71, #e74c3c);
}
```

**色标位置控制**：每个颜色后可跟 0~1 个或 2 个位置（`%`/`px`）。

```css
/* 两个位置 = 从该点到下个点之间纯色（色带） */
.rainbow-band {
  background: linear-gradient(90deg,
    red 0 20%, orange 0 40%, yellow 0 40% 60%, green 0 80%, blue 0);
  /* "0" 是简写：让下一个色标从上一个的终点接着开始 */
}
```

### 3.2 硬中断：造锐利边界（最核心技巧）

**把两个色标放在同一个位置**，过渡宽度归零，就得到一条锐利的边界线：

```css
/* ❌ 模糊过渡：默认会在两色之间插值 */
background: linear-gradient(90deg, #000 50%, #fff 50%);  /* 这就是硬中断 ✅ */

/* 等价写法：用两个位置 */
background: linear-gradient(90deg, #000 0 50%, #fff 50% 100%);
```

`#000 50%, #fff 50%` 是最常用的"对半分"写法。基于它就能拼条纹：

```css
/* 斑马条纹（横向） */
.stripes-h {
  background: repeating-linear-gradient(
    0deg, #2c3e50 0 10px, #34495e 10px 20px);
}

/* 斜条纹（45°） */
.stripes-diag {
  background: repeating-linear-gradient(
    45deg, #e74c3c 0 12px, #fff 12px 24px);
}
```

`repeating-linear-gradient` 的一个周期 = 最后一个色标位置减去第一个色标位置（如上面 24px−0=24px），之后自动重复填满。

### 3.3 成品一：棋盘格（多层渐变叠加）

两种斜条纹反向叠加，交叉处变亮/变暗——利用**半透明叠加**：

```css
.checker {
  width: 240px; height: 240px;
  background-color: #fff;
  background-image:
    linear-gradient(45deg, #000 25%, transparent 25% 75%, #000 75%),
    linear-gradient(45deg, #000 25%, transparent 25% 75%, #000 75%);
  background-size: 40px 40px;             /* 每格 20px */
  background-position: 0 0, 20px 20px;    /* 第二层错开半格 */
}
```

原理：每层用 45° 硬中断画出"对角方块"，两层错开半格后交叉，正好拼成棋盘。

### 3.4 成品二：饼图 / 进度环 / 甜甜圈

纯 `conic-gradient` 就能画饼图，每段一个硬中断区间：

```css
/* 饼图：40% 红 / 30% 黄 / 30% 蓝 */
.pie {
  width: 200px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: conic-gradient(
    #e74c3c   0    40%,   /* 红：0 → 40% */
    #f1c40f   40%  70%,   /* 黄：40% → 70% */
    #3498db   70%  100%   /* 蓝：70% → 100% */
  );
}
```

**甜甜圈**：饼图 + 径向渐变把中间挖空（用 `mask`）：

```css
.donut {
  width: 200px; aspect-ratio: 1; border-radius: 50%;
  background: conic-gradient(#e74c3c 0 65%, #ecf0f1 65% 100%);
  -webkit-mask: radial-gradient(circle, transparent 0 45%, #000 46%);
          mask: radial-gradient(circle, transparent 0 45%, #000 46%);
}
```

**进度环（可动画，配合第 8 节的 @property）**：见 8.2。

### 3.5 成品三：径向光斑 / 聚光灯 / 卡片背景

用径向渐变叠出多光源的氛围背景：

```css
.glow-bg {
  width: 320px; height: 200px;
  background:
    radial-gradient(circle at 20% 20%, rgba(52,152,219,.9), transparent 45%),
    radial-gradient(circle at 80% 30%, rgba(155,89,182,.85), transparent 45%),
    radial-gradient(circle at 50% 90%, rgba(46,204,113,.8), transparent 50%),
    #0d1117;
}
```

再看一个"光斑光晕"贴片（配合 3.6 用）：

```css
.spot {
  background: radial-gradient(circle, #fff 0%, #f1c40f 30%, transparent 70%);
}
```

**什么时候用**：条纹/棋盘做纹理底，conic 做饼图与进度，radial 做灯光与氛围，linear 做斜切装饰。叠加层数越多越像"画"。
**兼容性注意点**：现代渐变语法（含 `repeating-*`、`conic-gradient`）主流浏览器均支持；`conic-gradient` 在旧浏览器无 polyfill，需给纯色 fallback（先写 `background: #ccc;` 再写渐变）。渐变无法被 `transition` 平滑补间（除非用 `@property` 注册变量，见第 8 节）。

---

## 4. box-shadow 当多重描边 / 光晕

`box-shadow: offset-x offset-y blur spread color`。画图时常用 **偏移=0、模糊=0、只留 spread** 的形式：`0 0 0 Npx color`，它就是一个贴着元素形状的**实心描边环**。逗号分隔可叠多层。

### 4.1 描边环（0 0 0 Npx）

```css
/* 单层描边环：用 spread 外扩 */
.ring {
  width: 100px; height: 100px;
  border-radius: 50%;
  background: #3498db;
  box-shadow: 0 0 0 6px #fff;      /* 白色 6px 环 */
}

/* 同心多层环（焦点 / 靶心 / 徽章） */
.bullseye {
  width: 80px; height: 80px;
  border-radius: 50%;
  background: #e74c3c;
  box-shadow:
    0 0 0 8px #fff,
    0 0 0 16px #e74c3c,
    0 0 0 24px #fff,
    0 0 0 32px #e74c3c;
}
```

关键点：**多层描边环的 spread 要依次递增**（8→16→24→32），否则后写的会盖住前面的。阴影跟随 `border-radius`，所以圆形元素得到的是**圆环**。

### 4.2 光晕 / 发光 / 立体投影

```css
/* 发光（blur 不为 0） */
.glow {
  width: 100px; height: 100px; border-radius: 50%;
  background: #f1c40f;
  box-shadow: 0 0 24px 8px rgba(241,196,15,.8),  /* 外发光 */
              0 0 60px 20px rgba(241,196,15,.35); /* 更大更淡的辉光 */
}

/* 长投影（多个等偏移阴影堆出 45° 长影） */
.long-shadow {
  width: 120px; height: 120px;
  background: #2c3e50;
  box-shadow:
    1px 1px 0 #1a252f, 2px 2px 0 #1a252f, 3px 3px 0 #1a252f,
    4px 4px 0 #1a252f, 5px 5px 0 #1a252f, 6px 6px 0 #1a252f;
}
```

**什么时候用**：描边环、多层边框、焦点态、霓虹发光、卡片悬浮阴影、长投影风格插画。
**兼容性注意点**：全支持；多层 box-shadow 数量多时有绘制开销但不重排。注意 `box-shadow` **跟随盒子边框矩形**（含 `border-radius`），不是跟随 `clip-path` 剪出的轮廓——要"沿轮廓发光"请用 `filter: drop-shadow()`（见 5.2）。

---

## 5. filter 全表

`filter` 作用于元素渲染结果，可链式叠加（`filter: blur(2px) brightness(1.2)`），**不影响布局**（只重绘，性能友好）。

| 函数 | 作用 | 示例代码 | 图像/画图用途 |
|---|---|---|---|
| `blur(Npx)` | 高斯模糊 | `filter: blur(4px)` | 毛玻璃底、虚化背景、柔化光斑边缘 |
| `brightness(N)` | 亮度，1 原值 | `filter: brightness(1.5)` | 提亮/压暗贴图 |
| `contrast(N)` | 对比度，1 原值 | `filter: contrast(1.4)` | 增强图案层次 |
| `drop-shadow(x y blur color)` | 沿**不透明轮廓**投影 | `filter: drop-shadow(4px 4px 6px rgba(0,0,0,.5))` | 给**任意形状**（含 clip-path 剪出的形）加影子 |
| `grayscale(N)` | 去色，1 全灰 | `filter: grayscale(1)` | 置灰、老照片 |
| `hue-rotate(Ndeg)` | 色相旋转 | `filter: hue-rotate(120deg)` | 一套素材换配色 |
| `saturate(N)` | 饱和度，1 原值 | `filter: saturate(2)` | 鲜艳/褪色 |
| `sepia(N)` | 复古棕，1 全棕 | `filter: sepia(.8)` | 怀旧 |
| `invert(N)` | 反色，1 全反 | `filter: invert(1)` | 反色/暗色模式翻转图标 |

```css
/* 一次性叠加：复古 + 提亮 + 降饱和 */
.vintage {
  filter: sepia(.6) brightness(1.1) saturate(.8) contrast(.95);
}
```

### 5.2 drop-shadow 与 box-shadow 的区别（重点）

```css
.a { box-shadow:  0 8px 16px rgba(0,0,0,.4); }        /* 影子是"矩形盒" + blur */
.b { filter: drop-shadow(0 8px 16px rgba(0,0,0,.4)); } /* 影子沿真实不透明轮廓 */
```

- `box-shadow`：影子形状永远是**元素的边框矩形**（圆角会被遵守）。给被 `clip-path` 剪过的元素用，影子仍是完整矩形 → 露馅。
- `drop-shadow()`：影子沿**实际可见像素的轮廓**生成 → 三角、星形、文字、PNG 透明图都对。代价是**更耗性能**（需要分析透明度，且会在裁剪/变换链上重绘）。

```css
/* 给 clip-path 形状配影子，必须用 drop-shadow */
.star-shadow {
  clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%,
                     50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
  background: #f1c40f;
  filter: drop-shadow(0 6px 8px rgba(0,0,0,.45)); /* 影子是星形 ✅ */
}
```

**什么时候用**：滤镜做整体调色与风格化；`drop-shadow` 专门给"非矩形轮廓"加影子。
**兼容性注意点**：`filter` 全支持（IE 不支持），Safari 老版本部分函数需 `-webkit-filter`。`filter` 会创建**包含块与层叠上下文**，可能影响 `position: fixed` 子元素与 `z-index` 行为，注意排查。

---

## 6. backdrop-filter 与 mix-blend-mode

### 6.1 backdrop-filter：毛玻璃

对**元素背后透过来的内容**做滤镜（元素自身不受影响）。典型是磨砂玻璃卡片：

```css
.frosted {
  background: rgba(255,255,255,.18);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%); /* Safari 必须前缀 */
  border: 1px solid rgba(255,255,255,.35);
  border-radius: 16px;
  padding: 24px;
}
```

效果取决于**背后有什么**：背后是图像/彩色渐变时最好看；背后是纯色时几乎看不出差别。

### 6.2 mix-blend-mode：图层混合

让元素与其**下层内容**做混合（类似 PS 混合模式）：

```css
.blend { mix-blend-mode: multiply; }   /* 正片叠底：压暗，白变透明 */
.blend { mix-blend-mode: screen; }     /* 滤色：提亮，黑变透明 */
.blend { mix-blend-mode: overlay; }    /* 叠加：增强对比 */
.blend { mix-blend-mode: difference; } /* 差值：反色，做酷炫效果 */
.blend { mix-blend-mode: luminosity; } /* 取亮度 */
```

配合 `isolation: isolate` 可以把混合**限制在某个容器内**，不污染整页：

```css
.artboard { isolation: isolate; }   /* 混合只发生在 artboard 内部 */
.artboard .layer { mix-blend-mode: screen; }
```

### 6.3 性能坑（必读）

- `backdrop-filter` 会强制浏览器在**每一帧**重新采样背后的内容并模糊，滚动/动画时开销明显；大面积 + 多层叠加容易掉帧。**尽量只用在固定的小区域**（导航条、卡片），别铺满全屏再动画。
- `backdrop-filter` 需要元素**背后有内容**，且元素本身需要有半透明背景色才能看到玻璃质感。
- `mix-blend-mode` 会让元素脱离普通合成，可能**触发新的层叠上下文**，导致 `z-index` 表现异常、`position: fixed` 子元素定位出错。
- 两者都会增加**合成层**，移动端内存/耗电敏感场景慎用。

**什么时候用**：毛玻璃 UI、复古/艺术叠色海报、双色调（duotone）图片。**兼容性注意点**：`backdrop-filter` 现代主流支持，Firefox 较晚才默认开启；务必写 `-webkit-` 前缀给 Safari。`mix-blend-mode` 主流支持，IE 不支持。

---

## 7. Grid / Flex 作为画面排版工具

把 Grid/Flex 当"画布坐标系统"用，比 `position: absolute` 手算坐标稳得多。

### 7.1 12 列网格的最小声明

```css
.grid-12 {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 16px;
}
/* 元素跨列：从第几列线开始，跨几列 */
.span-4  { grid-column: span 4; }   /* 或 grid-column: 1 / span 4 */
.span-6  { grid-column: span 6; }
.span-12 { grid-column: 1 / -1; }   /* -1 = 最后一条列线，铺满整行 */
```

`fr` 是"剩余空间的份数"：`1fr 1fr 1fr` = 三等分；`repeat(12, 1fr)` 就是 12 等分。`gap` 只作用于**项之间**，不占外边缘。

### 7.2 grid-area 命名区域（画版式最快）

用 `grid-template-areas` 直接把布局"画"成字符画，可读性极高：

```css
.layout {
  display: grid;
  grid-template-columns: 200px 1fr;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    "header header"
    "side   main"
    "footer footer";
  gap: 12px;
}
.header { grid-area: header; }
.side   { grid-area: side; }
.main   { grid-area: main; }
.footer { grid-area: footer; }
```

- 每行字符串代表一行网格，**每行格子数必须一致**。
- `.`（点）= 空单元格；同名区域连起来即自动跨格。
- 区域命名会**自动生成线名**（`header-start` / `header-end` 等）。

### 7.3 place-items 一键居中

```css
.center { display: grid; place-items: center; } /* 水平+垂直居中，一行搞定 */
```

`place-items: center` = `align-items: center` + `justify-items: center`。给单个子项覆盖用 `place-self: center`。

Flex 版的万能居中：

```css
.center-flex {
  display: flex;
  justify-content: center; /* 主轴居中 */
  align-items: center;     /* 交叉轴居中 */
}
```

### 7.4 auto-fit / minmax：无媒体查询的响应式

```css
.auto-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}
```

含义：每列最少 180px、最多平分剩余空间；容器变宽就自动多排几列，**不需要写媒体查询**。`auto-fit` 与 `auto-fill` 区别：空轨道时 `auto-fit` 会拉伸现有列填满，`auto-fill` 保留空列位置。

### 7.5 subgrid：让子项对齐父级轨道

```css
.card {
  display: grid;
  grid-template-rows: auto 1fr auto; /* 标题 / 内容 / 页脚 */
}
.card-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.card-list .card {
  display: grid;
  grid-row: span 3;
  grid-template-rows: subgrid; /* 卡片的行直接对齐父网格轨道 → 页脚等高对齐 */
}
```

**什么时候用**：页面骨架用命名区域，卡片墙/画廊用 auto-fit，视觉居中用 place-items，跨卡对齐用 subgrid。
**兼容性注意点**：Grid/Flex 主流全支持；**subgrid** 支持较晚（Firefox 早，Chrome/Safari 需较新版本），务必给降级（不写 `subgrid` 时的普通 `grid-template-rows`）。`place-items` 在 Flex 上行为与 Grid 略有差异，居中优先用 Grid。Grid `dense` 排列会改变视觉顺序，注意可访问性（读屏按源码顺序）。

---

## 8. CSS 变量与 @property：让渐变/颜色能动起来

CSS 变量（自定义属性）本身**不是可插值的动画对象**——`transition` 一个没注册的 `<color>`/`<angle>` 变量会直接跳变。`@property` 给变量**声明类型**后，它才变成可动画的值。

### 8.1 @property 基础语法

```css
@property --my-angle {
  syntax: '<angle>';        /* 声明类型：角度 */
  initial-value: 0deg;      /* 必须给初始值（非 inherits 时） */
  inherits: false;          /* 是否继承给子元素 */
}
@property --my-color {
  syntax: '<color>';
  initial-value: #3498db;
  inherits: false;
}
@property --my-num {
  syntax: '<number>';
  initial-value: 0;
  inherits: false;
}
```

- `syntax` 是类型描述符，决定浏览器如何插值：`<length>` `<percentage>` `<length-percentage>` `<color>` `<angle>` `<number>` `<integer>` `<time>` 等，也可用 `*`（任意，但**不可动画**）。
- 注册后，变量值变化就能被 `transition` / `@keyframes` **平滑补间**。
- 必须在 `:root` 或顶层注册（`@property` 是全局规则）。

### 8.2 让 conic-gradient 转起来（进度环 / 加载圈）

这是 `@property` 最实用的场景：注册角度变量 → 动画变量 → `conic-gradient(from var(--a), ...)` 跟着转。

```css
@property --angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

.loader {
  width: 120px;
  aspect-ratio: 1;
  border-radius: 50%;
  /* 用"两个同色标 + transparent"画出一段弧，从 --angle 开始 */
  background: conic-gradient(from 0deg, #3498db 0 25%, transparent 0);
  /* 想做成环形：再叠 mask 挖空中心 */
  -webkit-mask: radial-gradient(circle, transparent 0 38%, #000 39%);
          mask: radial-gradient(circle, transparent 0 38%, #000 39%);
  animation: spin 1.2s linear infinite;
}

@keyframes spin {
  to { --angle: 360deg; }   /* 注册过的 <angle> 才能被补间 */
}
```

配合 `rotating` 的另一种写法（让 `from` 跟着变量转）：

```css
.ring-progress {
  width: 120px; aspect-ratio: 1; border-radius: 50%;
  background: conic-gradient(from var(--angle), #e74c3c var(--p, 65%), #ecf0f1 0);
  transition: --angle .6s ease, --p .6s ease; /* 变量可过渡 */
}
.ring-progress:hover { --p: 90%; --angle: 90deg; }
```

> 注：`--p` 也要注册 `@property --p { syntax: '<percentage>'; initial-value: 0%; inherits: false; }` 才能补间。

### 8.3 让颜色平滑过渡

```css
@property --brand {
  syntax: '<color>';
  initial-value: #3498db;
  inherits: false;
}
.chip {
  background: var(--brand);
  transition: --brand .4s ease;
}
.chip:hover { --brand: #e74c3c; } /* 颜色平滑过渡，而非跳变 */
```

**什么时候用**：任何"渐变/颜色/角度需要动画"的场合——加载圈、进度条、主题切换、悬停变色、旋转光效。
**兼容性注意点**：`@property` 已被 Chrome / Edge / Safari / Firefox 支持（Firefox 较晚），老浏览器会**忽略注册但变量仍可用**（只是不补间），属于优雅降级。`@property` 注册后变量会受类型校验，赋错类型的值会退回 `initial-value`（这是 feature 不是 bug）。`inherits: false` 时 `initial-value` 必填。

---

## 附录：一句话选型速查

- 实色小三角/箭头 → `border` 三角
- 任意多边形 / 缺角 / 曲线轮廓 → `clip-path: polygon()/circle()`
- 条纹 / 棋盘 / 饼图 / 进度 / 光斑 → `background` 渐变（硬中断是关键）
- 沿真实轮廓的影子 → `filter: drop-shadow()`；矩形影子 → `box-shadow`
- 描边环 / 多层边框 / 发光 → `box-shadow: 0 0 0 Npx` 多层
- 毛玻璃 → `backdrop-filter: blur()`；艺术叠色 → `mix-blend-mode`
- 整体调色 / 风格化 → `filter` 链
- 版式骨架 → Grid 命名区域；卡片墙 → `auto-fit + minmax`
- 渐变/角度要动 → `@property` 注册类型后再 `transition` / `@keyframes`

**通用兼容性原则**：先给纯色 fallback，再写高级特性；Safari 记得 `-webkit-`（主要涉及 `mask` / `backdrop-filter` / 老版 `clip-path`）；`subgrid`、`@property` 视为渐进增强。所有 `filter` / `clip-path` 剪裁都会创建层叠上下文，注意 `z-index` 与 `position: fixed` 的表现。

---

> 配套：`snippets/css-01-shapes.html · css-02-gradient-paint.html · css-03-clippath.html`
> 出处见 `00-速查总览.md` 第六节。
