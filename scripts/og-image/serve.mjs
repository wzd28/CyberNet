#!/usr/bin/env node
/**
 * Regenerates public/og-image.jpg - the preview card shown when a cybernetai.app
 * link is shared or advertised on social platforms.
 *
 * The image is drawn in a real browser (canvas plus the site's own web fonts),
 * which is the only way to get Inter and JetBrains Mono without bundling font
 * files. This serves the render page and writes whatever it posts back.
 *
 *   node scripts/og-image/serve.mjs
 *   then open http://localhost:8765/ in a browser; the tab title reads SAVED.
 */
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, sep } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const OUT = join(ROOT, "public", "og-image.jpg");
const PORT = Number(process.env.PORT) || 8765;

const server = createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/save") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const dataUrl = Buffer.concat(chunks).toString("utf8");
      const match = dataUrl.match(/^data:image\/jpeg;base64,(.+)$/);
      if (!match) { res.writeHead(400).end("expected a JPEG data URL"); return; }
      const bytes = Buffer.from(match[1], "base64");
      await writeFile(OUT, bytes);
      console.log(`wrote ${OUT} (${bytes.length} bytes)`);
      res.writeHead(200).end("saved");
      setTimeout(() => process.exit(0), 200);
      return;
    }

    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(await readFile(join(HERE, "render.html")));
      return;
    }

    // Only the logo is needed from public/; refuse anything that escapes it.
    if (req.url.startsWith("/public/")) {
      const target = normalize(join(ROOT, decodeURIComponent(req.url.split("?")[0])));
      if (!target.startsWith(join(ROOT, "public") + sep)) { res.writeHead(403).end(); return; }
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(await readFile(target));
      return;
    }

    res.writeHead(404).end();
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`open http://localhost:${PORT}/ to render and save the image`);
});
