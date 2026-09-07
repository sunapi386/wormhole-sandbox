// Render README screenshots of each version with headless Chrome (SwiftShader GL,
// so WebGL works without a GPU). Usage: node scripts/shots.js
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.resolve(__dirname, "..");
const media = path.resolve(root, "media");
fs.mkdirSync(media, { recursive: true });

const pages = [
  ["index.html", "", "v1-blackhole.png"],
  ["v2.html", "", "v2-wormhole.png"],
  ["v3.html", "", "v3-network.png"],
  ["game.html", "#w0&notour", "game.png"],
];

for (const [page, frag, out] of pages) {
  const url = "file://" + path.resolve(root, page) + frag;
  const dest = path.resolve(media, out);
  const args = [
    "--headless=new", "--no-sandbox", "--disable-gpu-sandbox",
    "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    "--allow-file-access-from-files",
    "--window-size=1280,800", "--virtual-time-budget=4500", "--hide-scrollbars",
    "--screenshot=" + dest, url,
  ];
  const r = spawnSync("google-chrome", args, { encoding: "utf8", timeout: 60000 });
  console.log(out, "exit", r.status, fs.existsSync(dest) ? fs.statSync(dest).size + "b" : "NO FILE");
}
