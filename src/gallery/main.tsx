// 版式画廊：128 个版式一页铺开；鼠标悬停即重播该版式的入场动效。
// 这是「版式是否真的成立」的肉眼验收口，也是动效组合的试验场。

import { StrictMode, useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import gsap from "gsap";
import { LAYOUTS, LAYOUT_GROUPS } from "../layouts/catalog";
import { LayoutSVG } from "../layouts/render";
import { MOTIONS, MOTION_BY_ID } from "../motion/catalog";
import { applyMotion } from "../motion/apply";
import type { Layout, RenderContent } from "../layouts/types";
import type { StyleProfileId } from "../styles/style-system";
import "../styles/gallery.css";

const GROUP_LABEL: Record<string, string> = {
  // 编辑风（纸白 + 朱红）
  statement: "文字陈述", number: "数字焦点", compare: "对照", process: "因果流程",
  list: "列表要点", chart: "图表", image: "图像素材", quote: "引语", timeline: "时间序列", bookend: "片头片尾",
  // 扁平矢量叙事风（亮底 + 粒子/发光/3D）
  "poster-focus": "扁平 · 发光焦点", "poster-field": "扁平 · 粒子场",
  "poster-geo": "扁平 · 3D 几何", "poster-nest": "扁平 · 无限嵌套",
};

const GROUP_STYLE: Record<string, StyleProfileId> = Object.fromEntries(
  LAYOUT_GROUPS.map((g) => [g, g.startsWith("poster-") ? "flat-vector" : "editorial"]),
);

/** 画廊演示内容：全部来自一段真实旁白切出来的素材，数字可溯源。 */
function demoContent(layout: Layout, index: number): RenderContent {
  return {
    headline: "服务器返回 HTML，耗时 120 毫秒",
    subhead: "这一步叫 DNS 查询",
    bignum: "120",
    unit: "毫秒",
    caption: "浏览器先要解决地址问题",
    left: "十年前",
    right: "现在",
    bullets: ["输入网址按下回车", "翻译成 IP 地址", "服务器返回页面"],
    numbers: [120, 85, 3],
    beat: index + 1,
  };
}

function Card({ layout, index }: { layout: Layout; index: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const content = useMemo(() => demoContent(layout, index), [layout, index]);

  const replay = () => {
    const host = hostRef.current;
    if (!host) return;
    const slots = Array.from(host.querySelectorAll<SVGGElement>("[data-anim]"));
    const tl = gsap.timeline();
    slots.forEach((slotEl, k) => {
      const id = slotEl.getAttribute("data-motion") ?? layout.enter[k % layout.enter.length]!;
      const def = MOTION_BY_ID.get(id) ?? MOTION_BY_ID.get("m-fade-up")!;
      gsap.set(slotEl, { autoAlpha: 0 });
      applyMotion(def.id, { tl, el: slotEl, at: k * 0.06, dur: def.dur });
    });
    if (layout.emphasis) {
      const main = slots[0];
      const def = MOTION_BY_ID.get(layout.emphasis);
      if (main && def) applyMotion(def.id, { tl, el: main, at: 0.7, dur: def.dur });
    }
  };

  useEffect(() => { /* 卡片默认静止展示完整版式；悬停时才重播动效 */ }, [layout.id]);

  return (
    <figure
      className="g-card"
      data-layout={layout.id}
      data-group={layout.group}
      data-style={layout.style ?? "editorial"}
      onMouseEnter={replay}
      ref={hostRef}
    >
      <div className="g-canvas">
        <LayoutSVG layout={layout} content={content} />
      </div>
      <figcaption>
        <span className="g-id">{layout.id}</span>
        <span className="g-name">{layout.name}</span>
        <span className="g-motions">
          {layout.enter.join(" + ")}
          {layout.emphasis ? ` + ${layout.emphasis}` : ""}
          {layout.fx && layout.fx !== "none" ? ` ｜ fx: ${layout.fx}` : ""}
        </span>
      </figcaption>
    </figure>
  );
}

function Gallery() {
  const groups = LAYOUT_GROUPS.filter((g) => LAYOUTS.some((l) => l.group === g));
  const count = (style: StyleProfileId) =>
    LAYOUTS.filter((l) => (l.style ?? "editorial") === style).length;
  return (
    <>
      <header className="gh">
        <h1>版式画廊 · {LAYOUTS.length}</h1>
        <p className="tagline">
          动效原语 {MOTIONS.length} 个 · 悬停任意版式即重播它的入场动效 · 分组 {groups.length} 类（编辑风 {count("editorial")} / 扁平矢量风 {count("flat-vector")}）
        </p>
        <nav className="g-nav">
          {groups.map((g) => (
            <a key={g} href={`#g-${g}`} data-style={GROUP_STYLE[g]}>
              {GROUP_LABEL[g] ?? g}（{LAYOUTS.filter((l) => l.group === g).length}）
            </a>
          ))}
        </nav>
      </header>
      {groups.map((g) => (
        <section key={g} id={`g-${g}`} className="g-section" data-style={GROUP_STYLE[g]}>
          <h2>{GROUP_LABEL[g] ?? g}</h2>
          <div className="g-grid">
            {LAYOUTS.filter((l) => l.group === g).map((l) => (
              <Card key={l.id} layout={l} index={LAYOUTS.indexOf(l)} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);
