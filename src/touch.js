// On-screen twin-stick touch controls for phones/tablets (a space-fighter layout):
//   LEFT stick  -> pitch (up/down) + yaw (left/right)   [steer]
//   RIGHT stick -> roll (left/right) + throttle (fwd/back)
// Returns axes() -> {yaw, pitch, roll, throttle}, each in [-1, 1]. On non-touch devices it
// creates nothing and axes() is all zeros, so desktop is unaffected. Append `#sticks` to the
// URL to force the controls on for testing on a desktop.
window.createJoysticks = function (container) {
  const forceShow = /sticks|touch/.test(location.hash || "");
  const isTouch = forceShow || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
                  || ("ontouchstart" in window) || (navigator.maxTouchPoints || 0) > 0;
  const state = { yaw: 0, pitch: 0, roll: 0, throttle: 0 };
  if (!isTouch) return { isTouch: false, axes: () => state };

  const style = document.createElement("style");
  style.textContent = `
    .vj-base { position: fixed; bottom: 30px; width: 124px; height: 124px; border-radius: 50%;
      background: rgba(127,232,192,0.05); border: 1px solid rgba(127,232,192,0.28);
      z-index: 7; touch-action: none; -webkit-tap-highlight-color: transparent; }
    .vj-left { left: 22px; } .vj-right { right: 22px; }
    .vj-knob { position: absolute; left: 50%; top: 50%; width: 54px; height: 54px; margin: -27px 0 0 -27px;
      border-radius: 50%; background: rgba(127,232,192,0.32); border: 1px solid rgba(127,232,192,0.65);
      box-shadow: 0 0 14px rgba(127,232,192,0.4); transition: transform .05s linear; }
    .vj-label { position: absolute; bottom: -17px; left: 0; right: 0; text-align: center;
      font: 9px ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase;
      color: rgba(160,200,185,0.85); pointer-events: none; }`;
  document.head.appendChild(style);

  function makeStick(side, label) {
    const base = document.createElement("div"); base.className = "vj-base vj-" + side;
    const knob = document.createElement("div"); knob.className = "vj-knob";
    const cap = document.createElement("div"); cap.className = "vj-label"; cap.textContent = label;
    base.appendChild(knob); base.appendChild(cap);
    let id = null, nx = 0, ny = 0;
    const R = 48;
    function set(e) {
      const r = base.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const m = Math.hypot(dx, dy);
      if (m > R) { dx *= R / m; dy *= R / m; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      nx = dx / R; ny = -dy / R;
    }
    function release() { id = null; nx = 0; ny = 0; knob.style.transform = "translate(0,0)"; }
    base.addEventListener("pointerdown", (e) => { id = e.pointerId; base.setPointerCapture(id); set(e); e.preventDefault(); });
    base.addEventListener("pointermove", (e) => { if (e.pointerId === id) { set(e); e.preventDefault(); } });
    base.addEventListener("pointerup", (e) => { if (e.pointerId === id) release(); });
    base.addEventListener("pointercancel", (e) => { if (e.pointerId === id) release(); });
    container.appendChild(base);
    return () => ({ nx, ny });
  }

  const left = makeStick("left", "pitch · yaw");
  const right = makeStick("right", "roll · thrust");

  return {
    isTouch: true,
    axes: () => {
      const L = left(), R = right();
      state.yaw = L.nx; state.pitch = L.ny;      // left stick: steer
      state.roll = R.nx; state.throttle = R.ny;  // right stick: roll + throttle
      return state;
    },
  };
};
