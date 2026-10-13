# Canvas 2D 画法手册

> 面向"照着画"的操作手册。每条技法给最小可运行代码 + 什么时候用 / 什么时候别用。

---

## 0. 最小骨架

```html
<!doctype html>
<canvas id="c" width="600" height="400"></canvas>
<script>
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "tomato";
  ctx.fillRect(20, 20, 120, 80);
</script>
```

规则：

- 默认尺寸 300×150（CSS 像素）。用 `width`/`height` 属性改的是**画布位图分辨率**，用 CSS 改的只是**显示尺寸**（会拉伸）。
- 坐标系：原点 (0,0) 在**左上角**，1 单位默认 = 1 像素，y 轴向下。
- 所有绘制都通过 context 对象（`getContext("2d")`）进行，`<canvas>` 本身不画东西。

---

## 1. 上下文与状态机

### 1.1 save() / restore() 是核心心智模型

`save()` 把**整个绘图状态**压栈，`restore()` 弹出最近一次保存的状态。保存的内容包括：

- 变换矩阵（`translate` / `rotate` / `scale` / `transform` / `setTransform` 的结果）
- `strokeStyle` `fillStyle` `globalAlpha` `globalCompositeOperation`
- `lineWidth` `lineCap` `lineJoin` `miterLimit` `lineDashOffset` 及虚线数组
- `shadowOffsetX` `shadowOffsetY` `shadowBlur` `shadowColor`
- `font` `textAlign` `textBaseline` `direction`
- `imageSmoothingEnabled`
- 当前**裁剪路径**（clip）

注意：**当前路径（path）不在保存范围内**。路径只由 `beginPath()` 重置。

```js
ctx.fillStyle = "black";
ctx.fillRect(0, 0, 60, 60);

ctx.save();                      // 记录：fillStyle=black, 无变换
ctx.fillStyle = "blue";
ctx.translate(80, 0);
ctx.fillRect(0, 0, 60, 60);      // 蓝色、右移
ctx.restore();                   // 恢复 fillStyle=black、变换归零

ctx.fillRect(0, 80, 60, 60);     // 又是黑色、坐标未被平移
```

**什么时候用**：任何会改状态又要还原的地方——每个可复用的绘制函数、每帧的动画帧、局部旋转/裁剪/透明度。

**什么时候别用**：不要为了"省一次赋值"而 save/restore（它本身有开销，见 §10）。单次线性绘制、状态用完即弃时直接赋值更快。

### 1.2 不配对的后果

- `restore()` 次数 > `save()` 次数：栈空时 `restore()` 是**静默空操作**，不会报错，于是状态"恢复失败"，后续绘制出现幽灵平移、幽灵透明度。
- `save()` 次数 > `restore()` 次数：状态越堆越多 → 内存增长，且后续代码误以为已还原。
- 典型症状：某个函数里 `ctx.rotate()` 后没 restore，之后**所有**绘制都带着旋转，而代码里找不到 `rotate`。

```js
// 反面：rotate 泄漏
function drawArm(bad) {
  if (bad) ctx.rotate(0.5);      // 没有 restore
  ctx.fillRect(0, 0, 50, 10);
}
// 正面：进出成对
function drawArm(ctx, angle) {
  ctx.save();
  ctx.rotate(angle);
  ctx.fillRect(0, 0, 50, 10);
  ctx.restore();
}
```

**什么时候用**：写"绘制函数"时永远用 `save()/restore()` 包裹，让它对调用者零副作用。

**什么时候别用**：性能敏感的紧循环里，若状态改动可数且能画完自己还原，手工还原比 save/restore 便宜。

---

## 2. 路径绘制全套

Canvas 只有两种图元：**矩形**和**路径**（点与连线/曲线的列表）。其余形状都靠组合路径。

### 2.1 矩形三件套：即时绘制，不走 path

```js
ctx.fillStyle = "black";
ctx.fillRect(20, 20, 100, 100);     // 填充矩形（左上角 20,20，100×100）
ctx.clearRect(50, 50, 40, 40);      // 擦除为全透明
ctx.strokeStyle = "red";
ctx.lineWidth = 2;
ctx.strokeRect(52, 52, 36, 36);     // 描边矩形
```

- 三个函数签名相同：`(x, y, width, height)`，`x/y` 是**左上角**。
- 它们**立即绘制**，不进入当前路径，之后调 `stroke()` 不会把它们画第二遍。

**什么时候用**：矩形背景板、清屏、进度条、调试包围盒、UI 分块。

**什么时候别用**：需要参与填充规则/被裁剪/被 Path2D 复用/需要圆角时——改用 `rect()` / `roundRect()` 建路径。

### 2.2 路径三步走

```js
ctx.beginPath();                 // 1. 开新路径（会清空旧路径）
ctx.moveTo(50, 50);              // 2. 落笔（不画线）
ctx.lineTo(150, 50);             //    连线
ctx.lineTo(100, 130);
ctx.closePath();                 // 3. 可选：连回起点
ctx.fill();                      //    填充
ctx.stroke();                    //    描边
```

关键规则（背下来）：

- `beginPath()` 后**第一条构建命令总是被当作 `moveTo`**，无论它实际是什么。所以每次都显式写起始点。
- **`fill()` 会自动闭合开放子路径**；`stroke()` **不会**。描边三角形漏了 `closePath()` 只会画出两条边。
- `beginPath()` 会丢弃上一条路径。想同时保留多条路径用 `Path2D`（§2.10）。

**什么时候用**：一切非矩形形状。

**什么时候别用**：单纯画矩形用 §2.1 更快。

### 2.3 像素对齐：为什么你的线发虚

坐标 `2` 指的不是"第 2 个像素"，而是**两个像素之间的边界**。1px 宽的线以路径为中心向两侧各伸 0.5px，跨在两个像素上 → 两边各半透明 → 发灰发虚。

```js
ctx.lineWidth = 1;

// 发虚：路径压在像素边界上
ctx.beginPath();
ctx.moveTo(100, 20);
ctx.lineTo(100, 180);
ctx.stroke();

// 锐利：奇数线宽把路径放在半像素上（x.5）
ctx.beginPath();
ctx.moveTo(120.5, 20);
ctx.lineTo(120.5, 180);
ctx.stroke();

// 偶数线宽（2、4…）反过来：放在整数坐标上最实
ctx.lineWidth = 2;
ctx.beginPath();
ctx.moveTo(140, 20);
ctx.lineTo(140, 180);
ctx.stroke();
```

口诀：**奇数线宽 → 坐标取 `x.5`；偶数线宽 → 坐标取整数。**

推论：`strokeRect(50,50,50,50)` 画出来实际占 52×52（边缘各多半像素）。想要精确 50×50 的 1px 描边，得把矩形缩小一个线宽并平移半个线宽。

**什么时候用**：横平竖直的线、1px 分隔线、表格、图标描边——凡是要"锐利"就对齐。

**什么时候别用**：斜线/曲线/图形本来就抗锯齿，对齐没意义；此时反而该 `imageSmoothingEnabled` 保持默认。

**别用 `image-rendering: pixelated` 硬救**：当 CSS 像素不整除设备像素（`devicePixelRatio` 非整数）时，会出现有大有小的像素块。正解是 §9 的 DPR 适配。

### 2.4 arc —— 圆弧/圆

```js
// arc(x, y, radius, startAngle, endAngle, counterclockwise=false)
ctx.beginPath();
ctx.arc(150, 150, 80, 0, Math.PI * 2);      // 整圆（顺时针）
ctx.fill();

ctx.beginPath();
ctx.arc(150, 150, 80, 0, Math.PI);          // 半圆
ctx.stroke();

ctx.beginPath();
ctx.arc(150, 150, 80, 0, Math.PI, true);    // 半圆（逆时针）
ctx.stroke();
```

- 角度单位是**弧度**，不是度。换算：`radians = (Math.PI / 180) * degrees`。
- 角度从 **+x 轴**起算，`counterclockwise=false` 时顺时针（屏幕上视觉向下转）。
- 若当前路径已有当前点，`arc` 会先从该点连一条直线到弧起点；不想要就先用 `moveTo`。

**什么时候用**：圆、扇形、圆角、进度环、饼图。

**什么时候别用**：需要"从当前点平滑拐弯到目标点"时用 `arcTo`（§2.5），`arc` 会产生不想要的连线。

### 2.5 arcTo —— 圆角拐弯

```js
// arcTo(x1, y1, x2, y2, radius)：经过 (x1,y1) 的拐角处画一段半径为 radius 的圆角
ctx.beginPath();
ctx.moveTo(50, 150);
ctx.arcTo(150, 150, 150, 50, 40);   // 在 (150,150) 拐角处倒 40 半径圆角
ctx.lineTo(150, 50);
ctx.stroke();
```

**什么时候用**：手绘圆角折线、卡片切角、连接两条已知切线的平滑过渡。

**什么时候别用**：只要标准矩形圆角直接用 `roundRect()`；需要精确控制曲率用贝塞尔。

### 2.6 quadraticCurveTo —— 二次贝塞尔（1 个控制点）

```js
// quadraticCurveTo(cp1x, cp1y, x, y)
ctx.beginPath();
ctx.moveTo(50, 200);
ctx.quadraticCurveTo(150, 50, 250, 200);   // 顶点被拉向 (150,50)
ctx.stroke();
```

**什么时候用**：弧线、抛物轨迹、对话气泡的尖角、简单的"弯一下"。

**什么时候别用**：需要两个独立控制点做出 S 形或更复杂曲率时用三次贝塞尔。

### 2.7 bezierCurveTo —— 三次贝塞尔（2 个控制点）

```js
// bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y)
ctx.beginPath();
ctx.moveTo(50, 200);
ctx.bezierCurveTo(80, 60, 220, 60, 250, 200);   // 对称爱心顶部轮廓
ctx.stroke();
```

**什么时候用**：有机形状、心形、飘带、字体轮廓、任何需要"两个方向独立拉扯"的曲线。

**什么时候别用**：只要一个控制点就够时用二次更省；能从 Illustrator/Figma 导出 SVG path 就直接用 `Path2D(svgString)`（§2.10）。

**注意**：Canvas 画贝塞尔没有实时视觉反馈，调参靠反复渲染。复杂曲线建议在矢量软件里做好，导出 SVG path 字符串复用。

### 2.8 rect —— 路径版矩形

```js
ctx.beginPath();
ctx.rect(20, 20, 100, 60);
ctx.rect(140, 20, 100, 60);     // 同一路径里可以加多个子矩形
ctx.fill("evenodd");
```

- `rect()` 加入当前路径，**执行前会自动 `moveTo(x,y)`**（当前点被重置）。
- 因为是路径，可以一次 `fill()` 多个矩形、参与填充规则、被 `clip()`。

**什么时候用**：批量矩形、需要填充规则/裁剪/Path2D 时。

**什么时候别用**：单个矩形直接 `fillRect()`。

### 2.9 roundRect —— 圆角矩形

```js
// roundRect(x, y, w, h, radii)
ctx.beginPath();
ctx.roundRect(20, 20, 160, 100, 16);                    // 四角同半径
ctx.fill();

ctx.beginPath();
ctx.roundRect(200, 20, 160, 100, [16, 0, 16, 0]);       // 依次 左上/右上/右下/左下
ctx.fill();
```

**什么时候用**：卡片、按钮、标签、聊天气泡——现代 UI 几乎都需要。

**什么时候别用**：需要兼容很老的浏览器时，退回 `arcTo` 手绘圆角或预渲染的圆角九宫格。半径超过宽高一半会被自动夹取。

### 2.10 填充规则：nonzero vs evenodd（挖洞的两种思路）

`fill(rule)` 接受 `"nonzero"`（默认）或 `"evenodd"`。

- **nonzero（非零环绕）**：看子路径的**绕向**。外圈顺时针、内圈逆时针 → 环绕数抵消为 0 → 挖空。若内外都同向，环绕数非 0 → 实心。
- **evenodd（奇偶）**：看**穿过该点的射线与轮廓的交叉次数**。奇数次在内部、偶数次在外部 → 与绕向无关，只要内圈被外圈包住就挖空。

对照实验：

```js
// A. 两个圆同向 + nonzero → 实心（内圆不会挖洞）
ctx.beginPath();
ctx.arc(150, 150, 100, 0, Math.PI * 2);
ctx.arc(150, 150, 50, 0, Math.PI * 2);          // 同向
ctx.fill("nonzero");

// B. 两个圆同向 + evenodd → 挖出圆环
ctx.beginPath();
ctx.arc(150, 150, 100, 0, Math.PI * 2);
ctx.arc(150, 150, 50, 0, Math.PI * 2);          // 同向
ctx.fill("evenodd");

// C. 两个圆反向 + nonzero → 也挖出圆环（靠绕向抵消）
ctx.beginPath();
ctx.arc(150, 150, 100, 0, Math.PI * 2);
ctx.arc(150, 150, 50, 0, Math.PI * 2, true);    // 反向
ctx.fill("nonzero");
```

**什么时候用 nonzero**：手写"A 减 B"的孔洞（外顺时针 + 内逆时针），结果可控、和布尔运算工具一致。

**什么时候用 evenodd**：多子路径互相重叠、不想关心方向时——例如星形、齿轮、多个矩形相减，`evenodd` 一行搞定。

**什么时候别用**：涉及强烈重叠（三个以上轮廓叠在一起）时，两种规则结果差异会变难预测，先在纸上画清绕向/交叉次数再选。

### 2.11 Path2D —— 复用与 SVG 导入

```js
// 用 API 构建
const p = new Path2D();
p.moveTo(10, 10);
p.rect(20, 20, 60, 40);
p.arc(150, 60, 30, 0, Math.PI * 2);
ctx.stroke(p);            // stroke/fill 可直接接受 Path2D，忽略当前路径

// 用 SVG path 字符串构建（跨 SVG/Canvas 复用）
const star = new Path2D("M 100 10 L 120 70 L 185 70 L 132 108 L 152 168 L 100 132 L 48 168 L 68 108 L 15 70 L 80 70 Z");
ctx.fillStyle = "gold";
ctx.fill(star);

// 组合多条路径 + 施加变换
const combined = new Path2D();
combined.addPath(p);
combined.addPath(star, new DOMMatrix().translate(200, 0));
ctx.stroke(combined);
```

`Path2D` 上的方法与 context 的路径方法同名同签名（`moveTo` / `lineTo` / `arc` / `quadraticCurveTo` / `rect` / `addPath` …）。

**什么时候用**：同一形状每帧重绘（避免每帧重建路径）、复杂图标、复用 SVG 资源、把形状当数据传递。

**什么时候别用**：只画一次的临时路径，直接 context API 更少对象分配（建 `Path2D` 本身也是对象）。

---

## 3. 变换矩阵

### 3.1 translate —— 移动原点

```js
ctx.save();
ctx.translate(200, 100);         // 原点搬到 (200,100)
ctx.fillRect(0, 0, 60, 60);      // 等价于 fillRect(200,100,60,60)
ctx.restore();
```

**什么时候用**：把"相对坐标"的绘制放到任意位置（9 个格子用同一份 `fillRect(0,0,…)`）、旋转/缩放的枢轴点设置。

**什么时候别用**：只是想让单个图形偏移，直接改坐标更省；在循环里 translate 而不 restore 会让后续绘制跑出画布。

### 3.2 rotate —— 绕当前原点旋转

```js
ctx.save();
ctx.translate(150, 150);
ctx.rotate(Math.PI / 4);         // 顺时针 45°（弧度）
ctx.fillRect(-50, -30, 100, 60);
ctx.restore();
```

- 旋转中心**永远是当前原点**。想绕别处转，先 `translate`（§3.5）。
- 正角度 = 屏幕上的顺时针（因为 y 轴向下）。

### 3.3 scale —— 缩放与镜像

```js
ctx.save();
ctx.scale(2, 2);                 // 单位变 2px，图形放大两倍
ctx.fillRect(10, 10, 30, 30);    // 实际占 (20,20) 60×60
ctx.restore();

// 镜像：翻成数学坐标系（原点在左下）
ctx.save();
ctx.translate(0, canvas.height);
ctx.scale(1, -1);
ctx.fillText("倒过来", 0, 40);   // y 向上为正
ctx.restore();
```

- `< 1` 缩小、`> 1` 放大、`= 1` 不变；可为负 → 镜像（负值会翻转绕向，影响 nonzero 填充规则）。
- 缩放会同时放大**线宽**和**字体**。

**什么时候用**：整体缩放场景、镜像翻转、配合 DPR（§9）、做"缩放动画"。

**什么时候别用**：只想缩放位图时用 `drawImage` 的目标尺寸参数（§4.1），避免额外矩阵运算；不要用缩放实现"按窗口自适应"，那该用 CSS transform（§10.6）。

### 3.4 叠加顺序：顺序不同，结果不同

变换按调用顺序**右乘**到当前矩阵上。后调用的变换作用在"先调用后的坐标系"里。所以同样两个变换，换顺序结果不同：

```js
// 先平移再缩放：平移量不被缩放，点 (10,0) → (120,0)
ctx.save();
ctx.translate(100, 0);
ctx.scale(2, 2);
ctx.fillRect(10, 0, 20, 20);     // 实际位置 x = 100 + 20 = 120
ctx.restore();

// 先缩放再平移：平移量也被缩放，点 (10,0) → (200+20) = 220
ctx.save();
ctx.scale(2, 2);
ctx.translate(100, 0);
ctx.fillRect(10, 0, 20, 20);     // 实际位置 x = (100+10)*2 = 220
ctx.restore();
```

口诀：**变换是"给之后的坐标加一层外衣"，先写的在最外层。** "把物体搬到某点再旋转缩放" → `translate` 放最前；"在已缩放的坐标系里再偏移固定屏幕距离" → `translate` 放最后。

### 3.5 绕自身中心旋转（正确写法）

```js
/**
 * 以 (cx, cy) 为中心画一个 w×h 的旋转矩形
 */
function drawRotatedRect(ctx, cx, cy, w, h, angle) {
  ctx.save();
  ctx.translate(cx, cy);       // 1) 原点搬到图形中心
  ctx.rotate(angle);           // 2) 绕该新原点（=图形中心）旋转
  ctx.fillRect(-w / 2, -h / 2, w, h);  // 3) 以原点为中心画
  ctx.restore();
}
```

三步：`translate(中心)` → `rotate` → 用**以中心为原点**的坐标画（即 `-w/2, -h/2`）。这是所有"精灵自身旋转"的标准写法。缩放版同理把 `scale(sx, sy)` 插在 `translate` 之后。

### 3.6 setTransform / resetTransform / transform

```js
ctx.transform(a, b, c, d, e, f);       // 在当前矩阵上"再乘"一个矩阵
ctx.setTransform(a, b, c, d, e, f);    // 先用单位矩阵覆盖，再应用（= 忽略历史变换）
ctx.resetTransform();                  // 等价 ctx.setTransform(1, 0, 0, 1, 0, 0)
```

矩阵：

```
| a  c  e |
| b  d  f |
| 0  0  1 |
```

| 参数 | 含义 |
|---|---|
| `a` | 水平缩放 |
| `b` | 垂直斜切 |
| `c` | 水平斜切 |
| `d` | 垂直缩放 |
| `e` | 水平平移 (dx) |
| `f` | 垂直平移 (dy) |

**什么时候用 `setTransform`**：每帧开头重置到已知基准（避免上帧残留）、需要完全控制矩阵（如你自己维护相机矩阵）时，比 `resetTransform()` + 一串 `translate/rotate` 少几次调用。

**什么时候别用**：日常增量变换用 `translate/rotate/scale` 更可读；`setTransform` 会**丢弃**之前的变换，误用会让"以为是累加"的逻辑全错。

---

## 4. 图像与合成

### 4.1 drawImage 三 / 五 / 九参数

```js
const img = new Image();
img.src = "photo.png";
img.onload = () => {
  // 3 参数：原尺寸画到 (dx, dy)
  ctx.drawImage(img, 10, 10);

  // 5 参数：拉伸到 dWidth×dHeight
  ctx.drawImage(img, 10, 10, 200, 150);

  // 9 参数：裁剪源图某一区域，再缩放画到目标区域（精灵图/图集关键）
  // (sx, sy, sWidth, sHeight) 源矩形  →  (dx, dy, dWidth, dHeight) 目标矩形
  ctx.drawImage(img, 0, 0, 32, 32, 300, 10, 64, 64);
};
```

- 9 参数版本用于**精灵图（sprite sheet）**：一次加载整张图集，按帧切区域画。
- 源矩形超出图片边界时，超出部分不绘制（不会报错）。
- `dx/dy` 用浮点会触发子像素抗锯齿（§10.2）。

**什么时候用**：贴图、精灵动画、九宫格拉伸、icon 图集。

**什么时候别用**：需要真正的实时矢量缩放/旋转大量图像时，考虑 WebGL；`drawImage` 每次缩放大图会持续吃 CPU。

### 4.2 globalCompositeOperation 完整取值表

源（source）= 正在画的新内容；目标（destination）= 画布上已有的内容。

基础（Porter-Duff）：

| 取值 | 视觉结果 |
|---|---|
| `source-over` | 默认。源叠在目标之上 |
| `source-in` | 只保留源与目标**重叠**部分，显示源；目标不显示 |
| `source-out` | 只保留源**不与目标重叠**的部分 |
| `source-atop` | 源画在目标上，但只在目标不透明处显示 |
| `destination-over` | 目标叠在源之上（新内容画在下面） |
| `destination-in` | 目标与源重叠处保留；源不显示 |
| `destination-out` | 用源**挖掉**目标（擦除形状） |
| `destination-atop` | 目标保留，只显示与源重叠的目标；源在下 |
| `lighter` | 源与目标颜色、alpha 相加 → 变亮 / **发光叠加** |
| `copy` | 只显示源，目标被整体清除 |
| `xor` | 只显示两者**不重叠**的部分（异或） |

混合模式：

| 取值 | 视觉结果 |
|---|---|
| `multiply` | 相乘，变暗（阴影、正片叠底） |
| `screen` | 反向相乘，变亮（滤色） |
| `overlay` | multiply 与 screen 组合，提高对比 |
| `darken` | 取每通道较暗值 |
| `lighten` | 取每通道较亮值 |
| `color-dodge` | 提亮目标（减淡） |
| `color-burn` | 加深目标（颜色加深） |
| `hard-light` | 强对比叠加（类似聚光灯） |
| `soft-light` | 柔和叠加 |
| `difference` | 每通道差的绝对值 |
| `exclusion` | 类似 difference 但对比更低 |
| `hue` | 用源色相 + 目标饱和度/亮度 |
| `saturation` | 用源饱和度 + 目标色相/亮度 |
| `color` | 用源色相/饱和度 + 目标亮度 |
| `luminosity` | 用源亮度 + 目标色相/饱和度 |

常用效果的写法：

```js
// 挖空：用形状擦掉已有内容（做成"镂空遮罩"/橡皮）
ctx.globalCompositeOperation = "destination-out";
ctx.beginPath();
ctx.arc(150, 150, 60, 0, Math.PI * 2);
ctx.fill();                                   // 圆形区域被清空

// 发光：叠加互补色
ctx.globalCompositeOperation = "lighter";
ctx.shadowBlur = 0;
ctx.fillStyle = "rgba(80,180,255,0.8)";
ctx.beginPath();
ctx.arc(200, 150, 50, 0, Math.PI * 2);
ctx.fill();

// 只在已有图形内部上色（做成高光/花纹）
ctx.globalCompositeOperation = "source-atop";
ctx.fillStyle = "rgba(255,255,255,0.5)";
ctx.fillRect(0, 0, canvas.width, canvas.height);
```

一次画出所有取值做对照（每格一个矩形，源叠在目标上）：

```js
const OPS = [
  "source-over", "source-in", "source-out", "source-atop",
  "destination-over", "destination-in", "destination-out", "destination-atop",
  "lighter", "copy", "xor",
  "multiply", "screen", "overlay", "darken", "lighten",
  "color-dodge", "color-burn", "hard-light", "soft-light",
  "difference", "exclusion", "hue", "saturation", "color", "luminosity",
];

const cell = 100, cols = 6;
OPS.forEach((op, i) => {
  const cx = (i % cols) * cell;
  const cy = Math.floor(i / cols) * cell;

  ctx.save();
  ctx.translate(cx, cy);

  // 目标：一个蓝方块（先画，且不受本次合成影响）
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(0,120,255,0.9)";
  ctx.fillRect(10, 10, 60, 60);

  // 源：一个红圆
  ctx.globalCompositeOperation = op;
  ctx.fillStyle = "rgba(255,60,60,0.9)";
  ctx.beginPath();
  ctx.arc(50, 50, 30, 0, Math.PI * 2);
  ctx.fill();

  // 标签
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#000";
  ctx.font = "11px monospace";
  ctx.fillText(op, 4, 8);
  ctx.restore();
});
```

**什么时候用**：挖空（`destination-out`）、发光（`lighter`）、正片叠底阴影（`multiply`）、只在已有区域上色（`source-atop`）、遮罩（`destination-in`）。

**什么时候别用**：完整场景每帧切很多次合成模式会拖慢渲染，尽量把同一种模式的操作**批量连做**（§10.8）。`hue/saturation/color/luminosity` 在部分旧引擎上较慢，只在静态或低频绘制里用。

### 4.3 globalAlpha

```js
ctx.globalAlpha = 0.5;      // 0 全透明 ~ 1 完全不透明，作用于之后所有绘制
ctx.fillRect(0, 0, 100, 100);
ctx.globalAlpha = 1;        // 记得还原（或 save/restore）
```

**什么时候用**：整体淡入淡出、半透明图层。

**什么时候别用**：只调一个图形的透明度时，直接给 `fillStyle` 用 `rgba()` 更省，且不会影响后续绘制。`globalAlpha` 会让每次绘制都走一遍合成，累积调用有成本。

---

## 5. 渐变与图案

> 关键：渐变/图案的坐标**建立在调用时的当前用户空间**（受当时的变换矩阵影响）。在 `translate/rotate/scale` 之后再创建渐变，渐变的坐标要按**变换后的**坐标系给。

### 5.1 createLinearGradient

```js
const g = ctx.createLinearGradient(0, 0, 200, 0);   // 从 (0,0) 到 (200,0) 的方向
g.addColorStop(0, "#0af");
g.addColorStop(0.5, "#fff");
g.addColorStop(1, "#f0a");
ctx.fillStyle = g;
ctx.fillRect(0, 0, 200, 100);
```

- `(x0,y0)` 起点、`(x1,y1)` 终点，由这两点确定渐变方向与长度；与之垂直的方向颜色不变。
- 超出 `[0,1]` 的 `addColorStop` 会抛 `IndexSizeError`。

**什么时候用**：按钮/背景/条形渐变、光照感、进度条。

**什么时候别用**：纯色就够时别用（多一次对象分配与逐像素插值）。

### 5.2 createRadialGradient

```js
// (x0,y0,r0) 起始圆 → (x1,y1,r1) 结束圆
const rg = ctx.createRadialGradient(100, 100, 5, 100, 100, 80);
rg.addColorStop(0, "rgba(255,255,255,1)");
rg.addColorStop(1, "rgba(255,255,255,0)");
ctx.fillStyle = rg;
ctx.fillRect(0, 0, 200, 200);

// 两圆不同心 → 偏心光晕 / 圆锥感
const rg2 = ctx.createRadialGradient(80, 80, 0, 100, 100, 90);
```

**什么时候用**：径向光晕、球体明暗、聚光灯、渐隐遮罩（停在 `rgba(...,0)`）。

**什么时候别用**：要真正的"发光"叠加时，配合 `globalCompositeOperation = "lighter"`；单靠径向渐变不叠加不会真发光。

### 5.3 createConicGradient

```js
// createConicGradient(startAngle, x, y)：绕 (x,y) 从 startAngle 起顺时针渐变
const cg = ctx.createConicGradient(0, 150, 150);
for (let i = 0; i <= 12; i++) {
  cg.addColorStop(i / 12, `hsl(${i * 30} 90% 60%)`);
}
ctx.fillStyle = cg;
ctx.beginPath();
ctx.arc(150, 150, 120, 0, Math.PI * 2);
ctx.fill();
```

**什么时候用**：色环、雷达图、饼图分色、"仪表盘"刻度。

**什么时候别用**：老浏览器可能不支持，需要兼容就退回用多个扇形 `arc` 手绘。

### 5.4 createPattern

```js
// createPattern(image, repetition)
// repetition: "repeat" | "repeat-x" | "repeat-y" | "no-repeat"
const img = new Image();
img.src = "tile.png";
img.onload = () => {
  const pat = ctx.createPattern(img, "repeat");
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 图案也支持矩阵变换（缩放/旋转平铺）：在旧 API 里要手动 setTransform
  const m = new DOMMatrix().scale(0.5, 0.5).rotate(30);
  const pat2 = ctx.createPattern(img, "repeat").setTransform(m);
  ctx.fillStyle = pat2;
  ctx.fillRect(0, 0, 200, 200);
};
```

也可以拿另一个 `<canvas>` 或 `createImageBitmap` 的结果当图案源。

**什么时候用**：平铺贴图、无缝纹理、棋盘格、把离屏 canvas 当纹理大面积铺。

**什么时候别用**：非周期性的整图背景用 CSS `background` 更快（§10.6）；图案源图未加载完调用会得到透明图案。

---

## 6. 文字

### 6.1 fillText / strokeText / measureText

```js
ctx.font = "bold 24px 'Helvetica Neue', sans-serif";  // 与 CSS font 简写同语法
ctx.textAlign = "center";       // left | right | center | start | end
ctx.textBaseline = "middle";    // top | hanging | middle | alphabetic(默认) | ideographic | bottom

ctx.fillStyle = "#222";
ctx.fillText("你好 Canvas", 300, 200);        // 以 (300,200) 为锚点
ctx.strokeText("描边文字", 300, 240);

// 第三个可选参数 maxWidth：超过则横向压缩
ctx.fillText("长文本会被横向压扁", 300, 270, 180);

// 测量
const m = ctx.measureText("你好 Canvas");
console.log(m.width);                        // 文本宽度
console.log(m.actualBoundingBoxAscent);      // 基线以上高度
console.log(m.actualBoundingBoxDescent);     // 基线以下高度
```

**什么时候用**：标签、数据可视化标注、按钮文字、文字造型。

**什么时候别用**：`textBaseline`/`textAlign` 是**状态**，改完记得 `save/restore`；大量动态文字是性能杀手（§10.9），能用 DOM/CSS 文本就别用 canvas 文本。

### 6.2 字体加载完成再测量

Web Font 未加载完时，`measureText` 会用**回退字体**测量，得到的宽度是错的；等字体加载完再测才准。字体加载是异步的，必须在测量前 `await`。

```js
// 方式一：显式加载某个字体（可指定字号）
await document.fonts.load('24px "MyFont"');

// 方式二：等所有已声明字体就绪
await document.fonts.ready;

// 现在测量才准确
ctx.font = '24px "MyFont"';
const w = ctx.measureText("精确排版").width;
```

**什么时候用**：需要按文字实际宽度做居中/换行/背景框时，**必须**先加载。

**什么时候别用**：只是随便画个标签、不依赖精确宽度，可不等；但若字体晚到会看到字形跳变。

---

## 7. 像素级操作

### 7.1 getImageData / putImageData

```js
// getImageData(sx, sy, sw, sh) → ImageData { width, height, data: Uint8ClampedArray }
const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
const d = imageData.data;                    // RGBA，每像素 4 个 0~255 的整数
for (let i = 0; i < d.length; i += 4) {
  const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  d[i] = d[i + 1] = d[i + 2] = g;            // 灰度
  // d[i + 3] 是 alpha，此处不动
}
ctx.putImageData(imageData, 0, 0);           // 写回（无视当前变换与合成模式）
```

- 颜色空间是**非预乘**的 sRGB、8 位 clamp（0~255）。
- `putImageData` **不受** `globalAlpha` / `globalCompositeOperation` / 变换影响，是直接覆写像素。

**什么时候用**：滤镜、抠图、逐像素特效、扫描式碰撞检测、取色器。

**什么时候别用**：能靠 `fillStyle`+路径+合成模式实现的就别碰像素——逐像素循环是 O(像素数)，一帧几百万次 JS 运算极易掉帧。

### 7.2 createImageBitmap

```js
// 从 Blob / ImageData / Image / canvas / video 创建可绘制的位图
const resp = await fetch("photo.jpg");
const blob = await resp.blob();
const bmp = await createImageBitmap(blob);
ctx.drawImage(bmp, 0, 0);

// 也可以直接裁切 + 指定色彩空间，适合精灵图切分
const slice = await createImageBitmap(blob, 0, 0, 32, 32, {
  premultiplyAlpha: "premultiply",
});
```

**什么时候用**：需要在 Worker 里解码图片、从视频帧/离屏 canvas 取纹理、避免主线程解码卡顿、图集切分。

**什么时候别用**：只是简单贴一张已加载的 `<img>`，`drawImage(img,…)` 就够了。

### 7.3 为什么别在每帧调 getImageData

- `getImageData` 要把像素从 GPU/渲染后端**同步读回**到 CPU（readback），会强制打断渲染管线做同步等待，代价远高于普通绘制调用。
- 每次调用都会**新建**一个巨大的 `Uint8ClampedArray`（`w*h*4` 字节），每帧分配等于每秒制造几 MB 垃圾，触发频繁 GC。
- 读回 + JS 循环 + `putImageData` 上传，一帧做三遍全画布 I/O，1080p 下就是 800 万像素级别的搬运。

正确做法：

```js
// 1) 只在需要时读（例如用户点击取色），不要放进 rAF 循环
// 2) 只读关心的区域，不要整屏
const px = ctx.getImageData(mouseX, mouseY, 1, 1).data;

// 3) 必须频繁读写时，声明 willReadFrequently，让浏览器选择 CPU 侧后备存储
const ctx2d = canvas.getContext("2d", { willReadFrequently: true });

// 4) 全屏滤镜尽量放到离屏 canvas，且只在内容变化时重算，缓存结果复用
```

**什么时候用 `willReadFrequently`**：确实要频繁 `getImageData` 的应用（如实时滤镜、图像编辑器）。

**什么时候别用**：不读像素的常规绘制别加它——它会让 canvas 走软件后备存储，反而拖慢纯绘制。

---

## 8. 动画循环

### 8.1 requestAnimationFrame 正确写法（含 dt 归一化）

```js
let last = performance.now();
let angle = 0;

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);  // 秒；夹住上限防后台恢复时跳帧
  last = now;

  // 1) 清屏（除整屏背景图外都要清）
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 2) 每帧从干净状态开始
  ctx.save();

  // 3) 用 dt 归一化：不论 60Hz 还是 120Hz，速度一致
  angle += 2 * Math.PI * dt;                        // 每秒转一圈
  drawRotatedRect(ctx, 300, 200, 80, 80, angle);

  ctx.restore();

  // 4) 预约下一帧
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

要点：

1. **清屏**：`clearRect` 或用背景色 `fillRect`（`fillRect` 比 `clearRect` 在某些引擎更快，见 §10.10）。
2. **每帧 save/restore**：保证帧之间状态不串。
3. **dt 归一化**：用时间差算位移，而不是"每帧加固定值"，否则高刷屏/低端机速度不一致。
4. **不要 `for` 循环跑动画**：脚本一跑到底才上屏，循环只会画最后一帧。

**什么时候用**：一切随时间变化的绘制（游戏、图表动画、粒子）。

**什么时候别用**：内容完全静态时不必开循环空转。

### 8.2 为什么不用 setInterval

- `setInterval` 与显示器刷新**不同步**，会出现撕裂、抖动、丢帧；`requestAnimationFrame` 在浏览器下一次重绘前调用，天然对齐 VSync。
- 后台标签页里 `setInterval` 仍可能被节流/堆积回调，而 `requestAnimationFrame` **自动暂停**，省电且不会积压。
- `setInterval(fn, 16)` 的 16ms 是"至少"，实际间隔会被主线程忙时拉长，造成速度漂移；`rAF` 给的时间戳是准确的。

```js
// 别这样
setInterval(() => { angle += 0.05; render(); }, 16);

// 该这样：见 8.1 的 rAF 循环
```

### 8.3 后台标签页暂停

`requestAnimationFrame` 在标签页不可见时**自动停止调用**（这正是我们想要的）。若你在恢复时需要"补时间"或不想让动画瞬跳：

```js
// rAF 已自动暂停；用 visibilitychange 处理"隐藏时保存、显示时重置基准"
let last = performance.now();
let paused = false;

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    paused = true;
  } else {
    paused = false;
    last = performance.now();   // 重置时间基准，避免回到前台瞬间 dt 巨大
  }
});

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);  // 夹住 dt 是第二道保险
  last = now;
  if (!paused) { update(dt); render(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

**什么时候用**：游戏、需要暂停/计时的应用、状态机驱动的动画。

**什么时候别用**：纯装饰性动画，直接依赖 rAF 的自动暂停即可，不必加 visibility 监听。

---

## 9. 高清屏与导出

### 9.1 devicePixelRatio 缩放

高 DPI 屏（Retina 等）一个 CSS 像素由多个设备像素构成。若画布位图只有 CSS 尺寸那么多像素，会被浏览器放大 → 模糊。做法是把位图放大 dpr 倍，再把 context 缩放回 dpr 倍，绘制代码仍用 CSS 像素坐标。

```js
function setupHiDPI(canvas) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  // 位图分辨率 = CSS 尺寸 × dpr
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);

  // 让绘制坐标按 CSS 像素走
  ctx.scale(dpr, dpr);

  // 声明显示尺寸（CSS）
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;

  return { ctx, dpr, cssWidth: rect.width, cssHeight: rect.height };
}

const { ctx, cssWidth, cssHeight } = setupHiDPI(document.getElementById("c"));
ctx.fillRect(10, 10, 100, 60);   // 用 CSS 像素坐标，无需关心 dpr
```

注意事项：

- **改 `canvas.width/height` 会清空画布并重置所有 context 状态**（包括变换、样式）。所以 `ctx.scale(dpr, dpr)` 必须在设置尺寸**之后**、且每帧或在 resize 时重新应用。
- 之后 `clearRect(0, 0, cssWidth, cssHeight)` 用 CSS 尺寸即可。
- 窗口尺寸变化要重跑（配合 `ResizeObserver`）。

**什么时候用**：所有正经网页里的 canvas 都应该做，否则高分屏必糊。

**什么时候别用**：故意做像素风游戏、需要 1:1 物理像素映射、或已用 CSS `transform: scale` 放大的场景（那时加 dpr 反而浪费）。

### 9.2 toBlob / toDataURL 导出

```js
// toBlob(callback, type, quality) —— 异步，推荐
canvas.toBlob((blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "artwork.png";
  a.click();
  URL.revokeObjectURL(url);     // 用完释放
}, "image/png");                 // 或 "image/jpeg" / "image/webp"

// toBlob(cb, "image/jpeg", 0.9)  第三个参数仅对 jpeg/webp 有效（0~1 质量）
```

```js
// toDataURL(type, quality) —— 同步、返回 base64 字符串，体积比 blob 大约 33%，大图会卡主线程
const dataUrl = canvas.toDataURL("image/png");
```

- 若画布被**跨域**图片污染（tainted），导出会抛 `SecurityError`。加载外域图片需 `img.crossOrigin = "anonymous"` 且服务器返回允许的 CORS 头。

**什么时候用**：保存/下载、上传服务器、生成分享图、把 canvas 转成图片数据。

**什么时候别用**：大画布（如 4K）用 `toDataURL` 会明显卡顿，优先 `toBlob`；频繁导出用 `OffscreenCanvas.convertToBlob()` 放到 Worker 里做。

---

## 10. 性能清单

### 10.1 离屏 canvas 缓存重复内容

每帧重复的绘制（静态背景、复杂图标、预渲染的粒子形状）先画到离屏 canvas，之后每帧只 `drawImage` 一次。

```js
// 预渲染到离屏 canvas
const off = document.createElement("canvas");
off.width = 64;
off.height = 64;
const octx = off.getContext("2d");
// …在 octx 上画一个复杂的图标…

// 主循环里只贴图
ctx.drawImage(off, x, y);
```

（现代也可用 `new OffscreenCanvas(w, h)`，可在 Worker 中绘制。）

**什么时候用**：内容重复且不变、或渲染成本高但结果固定（网格、纹理、复杂图标、粒子贴图）。

**什么时候别用**：内容每帧都变时缓存无意义；缓存大量大离屏 canvas 会吃内存。

### 10.2 用整数坐标，避免子像素

```js
ctx.drawImage(myImage, 0.3, 0.5);                 // 触发额外抗锯齿计算

ctx.drawImage(myImage, Math.floor(0.3), Math.floor(0.5));  // 更好
```

**什么时候用**：位图绘制、UI 元素定位。

**什么时候别用**：平滑移动的物体需要亚像素精度时（否则会抖动），此时接受抗锯齿——用子像素保证运动平滑，用整数保证静止清晰。

### 10.3 别在 drawImage 里缩放

```js
// 慢：每帧缩放
ctx.drawImage(hugeImg, x, y, 64, 64);

// 快：加载时就预生成需要的尺寸
const small = document.createElement("canvas");
small.width = small.height = 64;
small.getContext("2d").drawImage(hugeImg, 0, 0, 64, 64);
// 循环里
ctx.drawImage(small, x, y);
```

**什么时候用**：固定目标尺寸、或同一资源要显示多种尺寸时，缓存各尺寸副本。

**什么时候别用**：尺寸持续变化（如缩放动画）时缓存会失效/爆内存，这时直接 `drawImage` 缩放。

### 10.4 分层 canvas

变化频率不同的内容放到不同的 `<canvas>` 叠起来：UI 层（仅交互时变）、游戏层（每帧变）、背景层（基本不变）。

```html
<div id="stage">
  <canvas id="ui-layer" width="480" height="320"></canvas>
  <canvas id="game-layer" width="480" height="320"></canvas>
  <canvas id="background-layer" width="480" height="320"></canvas>
</div>
```

```css
#stage { width: 480px; height: 320px; position: relative; border: 2px solid black; }
canvas { position: absolute; }
#ui-layer         { z-index: 3; }
#game-layer       { z-index: 2; }
#background-layer { z-index: 1; }
```

**什么时候用**：静态背景 + 动态前景、UI 覆盖层、需要独立重绘区域。

**什么时候别用**：层数过多会增加合成开销与内存；只有 1~2 个动态元素时一个 canvas 就够。

### 10.5 大背景图交给 CSS

静态背景图用 CSS `background` 画在 canvas 下方的 div 上，省掉每帧重绘背景。

```css
#bg {
  position: absolute; inset: 0;
  background: url(bg.jpg) center / cover no-repeat;
}
```

**什么时候用**：静态大图背景、渐变背景。

**什么时候别用**：背景需要被 canvas 操作（裁剪/合成/像素处理）时必须在 canvas 里画。

### 10.6 用 CSS transform 缩放画布（走 GPU）

```js
const scaleX = window.innerWidth / canvas.width;
const scaleY = window.innerHeight / canvas.height;
const scaleToFit = Math.min(scaleX, scaleY);   // contain
// const scaleToCover = Math.max(scaleX, scaleY); // cover

stage.style.transformOrigin = "0 0";           // 从左上角缩放
stage.style.transform = `scale(${scaleToFit})`;
```

**什么时候用**：全屏自适应、响应式放大。

**什么时候别用**：需要保持 1:1 像素清晰度时（CSS 缩放位图会插值变糊），或需要精确点击坐标映射时（要反算 scale）。最佳实践是"小 canvas + CSS 放大"而非"大 canvas + CSS 缩小"。

### 10.7 alpha: false —— 关掉透明通道

```js
const ctx = canvas.getContext("2d", { alpha: false });
```

**什么时候用**：画布不透明（有整屏背景）、不依赖透明合成时，浏览器可跳过 alpha 混合与清屏优化。

**什么时候别用**：需要画布透明（露出下层 DOM 或分层叠加）时不能用。

### 10.8 批量路径合并 / 减少状态切换

```js
// 慢：每条线一次 beginPath + stroke
for (const seg of segments) {
  ctx.beginPath();
  ctx.moveTo(seg.x1, seg.y1);
  ctx.lineTo(seg.x2, seg.y2);
  ctx.stroke();
}

// 快：合并成一条路径，一次 stroke
ctx.beginPath();
for (const seg of segments) {
  ctx.moveTo(seg.x1, seg.y1);
  ctx.lineTo(seg.x2, seg.y2);
}
ctx.stroke();
```

同理：连续绘制共享同一 `fillStyle`/`strokeStyle`/`globalCompositeOperation` 的图形时，**先按状态分组再画**，避免反复切状态。

**什么时候用**：大量同款小图元（网格线、粒子、路径点）、同状态对象多的场景。

**什么时候别用**：合并后会与不同状态/填充规则冲突时；需要单个图元独立命中测试时，合并后无法区分（需另存几何数据）。

### 10.9 save/restore 的代价与规避

`save()`/`restore()` 要整体拷贝/恢复状态对象，在每帧成千上万次调用的热路径里会明显。规避：

```js
// 慢：每个粒子都 save/restore
for (const p of particles) {
  ctx.save();
  ctx.globalAlpha = p.a;
  ctx.fillRect(p.x, p.y, 2, 2);
  ctx.restore();
}

// 快：只要状态可预测，手工设置与还原
const savedAlpha = ctx.globalAlpha;
for (const p of particles) {
  ctx.globalAlpha = p.a;
  ctx.fillRect(p.x, p.y, 2, 2);
}
ctx.globalAlpha = savedAlpha;
```

**什么时候用 save/restore**：可读性优先、调用次数少、需要保护一大片未知的状态改动。

**什么时候别用**：紧循环、状态改动可数、能手工还原时——手工还原更便宜。

### 10.10 清理画布的方式对比

```js
// A. clearRect —— 擦成透明，最常用
ctx.clearRect(0, 0, w, h);

// B. fillRect 盖一层不透明背景色 —— 有纯色背景时通常更快
ctx.fillStyle = "#fff";
ctx.fillRect(0, 0, w, h);

// C. 改 canvas.width —— 最彻底但最贵，会重建后备缓冲并清空所有状态
canvas.width = canvas.width;
```

**什么时候用**：有整屏不透明背景 → B；需要透明或不规则 → A；需要重置一切（含样式/变换）→ C。

**什么时候别用**：C 不要放进每帧循环（重建缓冲很重）；A/B 选哪个要**实测**，不同引擎各有偏好。

### 10.11 Path2D 复用

```js
// 一次构建，每帧复用
const icon = new Path2D();
icon.moveTo(0, -10);
icon.lineTo(8, 8);
icon.lineTo(-8, 8);
icon.closePath();

function frame() {
  ctx.save();
  ctx.translate(x, y);
  ctx.fill(icon);       // 不再重建路径
  ctx.restore();
  requestAnimationFrame(frame);
}
```

**什么时候用**：形状固定、每帧/多次重绘的图元；复杂多边形、SVG 图标。

**什么时候别用**：路径每帧随数据变化（如实时折线图）时无法复用，直接 context 路径 API 更快。

### 10.12 避免 shadowBlur 与频繁文字渲染

```js
// 阴影：能用预渲染的带阴影贴图替代，就别每帧开 shadowBlur
// 文字：能在预渲染/离屏缓存里画好就缓存，别每帧 fillText 长文本
```

- `shadowBlur` 是公认的性能杀手，尤其大模糊半径，能预渲染就预渲染。
- `fillText`/`strokeText` 涉及字形光栅化，批量文字尽量缓存为离屏图或改用 DOM 文本。
- 另外：**只重绘变化区域**（局部 `clearRect` + 重画），不必每帧全屏重画；重型物理库要谨慎使用。

**什么时候用**：确实需要阴影/文字且频率低（标题、静态标注）。

**什么时候别用**：热循环里对每个对象开阴影或画大量文字——改用预渲染贴图或 CSS/DOM。

---

## 附：常用状态速查

| 状态属性 | 作用 |
|---|---|
| `fillStyle` / `strokeStyle` | 填充色 / 描边色（颜色、渐变、图案） |
| `lineWidth` | 描边线宽 |
| `lineCap` | 线端样式 `butt`(默认) / `round` / `square` |
| `lineJoin` | 拐角样式 `miter`(默认) / `round` / `bevel` |
| `miterLimit` | miter 尖角上限 |
| `setLineDash([...])` / `lineDashOffset` | 虚线样式与偏移 |
| `globalAlpha` | 全局透明度 |
| `globalCompositeOperation` | 合成模式 |
| `shadowBlur` / `shadowColor` | 阴影（慎用，有性能代价） |
| `font` / `textAlign` / `textBaseline` / `direction` | 文字 |
| `imageSmoothingEnabled` | 位图缩放是否平滑（默认 true） |
| `clip(path)` | 裁剪区域（属于被 save/restore 保存的状态） |

以上除"当前路径"外，全部受 `save()/restore()` 管理。

---

> 配套：`snippets/canvas-01-composite.html · canvas-02-transform.html · canvas-03-dpr-hidpi.html`
> 出处见 `00-速查总览.md` 第六节。
