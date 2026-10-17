// camera.js — 有意图的机位语法（拒绝“每拍机械缓推”）
// 研究结论：机位要有意图、要有变化；一个时刻一个主焦点。
// 9 种运动语言做成词表，由 storyboard 按叙事意图逐幕指派：
//   hold=静止呼吸 / pushIn=推近 / pushInSoft=缓推 / panLR·panRL=横移 dolly /
//   pullOut=拉开揭示 / pushDown=随线下沉 / sway=轻微弧摇

export const CAMERA_LIB = {
  hold:        { from:{scale:1.00, x:0,   y:0,  rot:0}, to:{scale:1.03, x:0,   y:0,  rot:0}, ease:'power1.inOut' },
  pushIn:      { from:{scale:1.00, x:0,   y:0,  rot:0}, to:{scale:1.10, x:0,   y:0,  rot:0}, ease:'power2.inOut' },
  pushInSoft:  { from:{scale:1.00, x:0,   y:0,  rot:0}, to:{scale:1.06, x:0,   y:0,  rot:0}, ease:'power1.inOut' },
  panLR:       { from:{scale:1.05, x:-55, y:0,  rot:0}, to:{scale:1.05, x:55,  y:0,  rot:0}, ease:'power1.inOut' },
  panRL:       { from:{scale:1.05, x:55,  y:0,  rot:0}, to:{scale:1.05, x:-55, y:0,  rot:0}, ease:'power1.inOut' },
  pullOut:     { from:{scale:1.18, x:0,   y:0,  rot:0}, to:{scale:1.00, x:0,   y:0,  rot:0}, ease:'power2.inOut' },
  pushDown:    { from:{scale:1.00, x:0,   y:0,  rot:0}, to:{scale:1.10, x:0,   y:26, rot:0}, ease:'power2.inOut' },
  sway:        { from:{scale:1.04, x:0,   y:0,  rot:-3},to:{scale:1.04, x:0,   y:0,  rot:3}, ease:'sine.inOut' },
};

export function applyCamera(tl, cameraEl, scene) {
  const c = CAMERA_LIB[scene.cam] || CAMERA_LIB.hold;
  const dur = Math.max(0.5, scene.end - scene.start);
  tl.fromTo(cameraEl,
    { scale: c.from.scale, x: c.from.x, y: c.from.y, rotation: c.from.rot, transformOrigin: '640px 360px' },
    { scale: c.to.scale,   x: c.to.x,   y: c.to.y,   rotation: c.to.rot,   duration: dur, ease: c.ease },
    scene.start);
}
