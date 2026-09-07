// 2D HUD overlay: on-screen tags/arrows pointing to each wormhole mouth in the current world,
// plus a top-down mini-map radar. Pure canvas 2D; draws in CSS-pixel coordinates.
window.createOverlay = function (octx, portals, worldHex, worldNames) {
  function draw(basis, cam, W, H, fovRad) {
    const cx0 = W/2, cy0 = H/2;
    octx.clearRect(0, 0, W, H);
    octx.textBaseline = "middle";
    const thy = Math.tan(fovRad/2), thx = thy * (W/H);
    const V = window.VEC;

    for (let i = 0; i < portals.count; i++) {
      if (portals.list[i].world !== cam.world) continue;
      const P = portals.list[i].pos;
      const v = V.sub(P, cam.pos);
      const fz = V.dot(v, basis.fwd), fx = V.dot(v, basis.right), fy = V.dot(v, basis.up);
      const denom = Math.max(Math.abs(fz), 1e-3);
      let sx = (fx/denom)/thx, sy = (fy/denom)/thy;
      const col = worldHex[portals.list[i].dstWorld];
      const name = worldNames[portals.list[i].dstWorld].toUpperCase();
      const onscreen = fz > 0 && Math.abs(sx) <= 0.9 && Math.abs(sy) <= 0.9;

      if (onscreen) {
        onScreenTag(cx0 + sx*(W/2), cy0 - sy*(H/2), name, col);
      } else {
        if (fz <= 0 && Math.hypot(sx, sy) < 0.05) sy = -1;
        const a = Math.atan2(sy, sx), dxu = Math.cos(a), dyu = Math.sin(a);
        const mx = W/2 - 52, my = H/2 - 52;
        const t = Math.min(Math.abs(mx/(Math.abs(dxu) < 1e-3 ? 1e-3 : dxu)), Math.abs(my/(Math.abs(dyu) < 1e-3 ? 1e-3 : dyu)));
        edgeArrow(cx0 + dxu*t, cy0 - dyu*t, Math.atan2(-dyu, dxu), name, col, W);
      }
    }
    drawMinimap(cam, W, H);
  }

  function onScreenTag(x, y, name, col) {
    octx.save();
    octx.font = "600 11px ui-monospace, monospace";
    const w = octx.measureText(name).width + 20, ly = y - 34;
    octx.beginPath(); octx.moveTo(x, y-12); octx.lineTo(x-5, ly+9); octx.lineTo(x+5, ly+9); octx.closePath();
    octx.fillStyle = col; octx.globalAlpha = 0.9; octx.fill();
    roundRect(x - w/2, ly - 9, w, 18, 5);
    octx.fillStyle = "rgba(8,10,16,0.72)"; octx.fill();
    octx.lineWidth = 1; octx.strokeStyle = col; octx.globalAlpha = 0.9; octx.stroke();
    octx.globalAlpha = 1; octx.fillStyle = col; octx.textAlign = "center";
    octx.fillText(name, x, ly + 1);
    octx.restore();
  }

  function edgeArrow(x, y, ang, name, col, W) {
    octx.save(); octx.translate(x, y); octx.rotate(ang);
    octx.beginPath(); octx.moveTo(12, 0); octx.lineTo(-8, 8); octx.lineTo(-8, -8); octx.closePath();
    octx.fillStyle = col; octx.globalAlpha = 0.95; octx.fill();
    octx.restore();
    octx.save();
    octx.font = "600 10px ui-monospace, monospace"; octx.fillStyle = col; octx.globalAlpha = 0.9;
    octx.textAlign = x > W/2 ? "right" : "left"; octx.textBaseline = "middle";
    octx.fillText(name, x + (x > W/2 ? -18 : 18), y);
    octx.restore();
  }

  function drawMinimap(cam, W, H) {
    const R = 60, pad = 16, cx = W - R - pad, cy = H - R - pad, scale = R/12;
    octx.save();
    octx.beginPath(); octx.arc(cx, cy, R, 0, 7); octx.fillStyle = "rgba(10,12,20,0.68)"; octx.fill();
    octx.lineWidth = 1; octx.strokeStyle = "rgba(120,220,180,0.35)"; octx.stroke();
    octx.beginPath(); octx.arc(cx, cy, R*0.6, 0, 7); octx.strokeStyle = "rgba(120,220,180,0.12)"; octx.stroke();
    octx.save();
    octx.beginPath(); octx.arc(cx, cy, R-2, 0, 7); octx.clip();
    const clamp = (px, py) => { let dx = px-cx, dy = py-cy, d = Math.hypot(dx, dy), m = R-7; if (d > m){ dx *= m/d; dy *= m/d; } return [cx+dx, cy+dy]; };
    for (let i = 0; i < portals.count; i++) {
      if (portals.list[i].world !== cam.world) continue;
      const p = clamp(cx + portals.list[i].pos[0]*scale, cy + portals.list[i].pos[2]*scale);
      octx.beginPath(); octx.arc(p[0], p[1], 4, 0, 7); octx.fillStyle = worldHex[portals.list[i].dstWorld]; octx.fill();
      octx.beginPath(); octx.arc(p[0], p[1], 6.5, 0, 7); octx.strokeStyle = worldHex[portals.list[i].dstWorld]; octx.globalAlpha = 0.5; octx.stroke(); octx.globalAlpha = 1;
    }
    const c = clamp(cx + cam.pos[0]*scale, cy + cam.pos[2]*scale);
    octx.save(); octx.translate(c[0], c[1]); octx.rotate(Math.atan2(Math.sin(cam.yaw), Math.cos(cam.yaw)));
    octx.beginPath(); octx.moveTo(7, 0); octx.lineTo(-4, 4); octx.lineTo(-4, -4); octx.closePath();
    octx.fillStyle = "#7fe8c0"; octx.fill(); octx.restore();
    octx.restore();
    octx.fillStyle = "rgba(150,180,170,0.85)"; octx.font = "9px ui-monospace, monospace"; octx.textAlign = "center";
    octx.fillText("MAP", cx, cy - R - 5);
    octx.restore();
  }

  function roundRect(x, y, w, h, r) {
    octx.beginPath(); octx.moveTo(x+r, y); octx.arcTo(x+w, y, x+w, y+h, r); octx.arcTo(x+w, y+h, x, y+h, r);
    octx.arcTo(x, y+h, x, y, r); octx.arcTo(x, y, x+w, y, r); octx.closePath();
  }

  return { draw };
};
