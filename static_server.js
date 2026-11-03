// webmaker(WebMaker2) 리포 미리보기용 정적 서버
// 사용법: 서버시작.bat 더블클릭 (또는 이 폴더에서 `node static_server.js`)
// 접속:   http://localhost:8732  → 고객 폴더 목록에서 선택
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname; // 이 스크립트가 있는 폴더(리포 루트)가 서버 루트
const PORT = 8732;

// .html에 charset을 강제하지 않는다 — 옛 사이트(euc-kr)와 새 파일(utf-8)이 섞여 있어
// 각 문서의 <meta charset> 선언을 브라우저가 따르게 하기 위함.
const MIME = {
  ".html": "text/html", ".htm": "text/html",
  ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".xml": "text/xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".bmp": "image/bmp",
  ".woff": "font/woff", ".woff2": "font/woff2",
  ".ttf": "font/ttf", ".otf": "font/otf", ".eot": "application/vnd.ms-fontobject",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg",
  ".txt": "text/plain", ".asp": "text/plain", ".inc": "text/plain",
  ".pdf": "application/pdf",
};

function sendFile(filePath, res) {
  const type = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  const stream = fs.createReadStream(filePath);
  stream.on("open", () => {
    res.writeHead(200, { "Content-Type": type });
    stream.pipe(res);
  });
  stream.on("error", () => {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  });
}

function sendListing(dirPath, urlPath, res) {
  fs.readdir(dirPath, { withFileTypes: true }, (err, entries) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("readdir error");
    }
    const visible = entries.filter((e) => !e.name.startsWith("."));
    const dirs = visible.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    const files = visible.filter((e) => !e.isDirectory()).map((e) => e.name).sort();
    const rows = [];
    if (urlPath !== "/") rows.push('<li><a href="../">&#8617; 상위 폴더</a></li>');
    for (const d of dirs) rows.push(`<li>&#128193; <a href="${encodeURIComponent(d)}/">${d}/</a></li>`);
    for (const f of files) rows.push(`<li>&#128196; <a href="${encodeURIComponent(f)}">${f}</a></li>`);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>${urlPath}</title>
<style>body{font-family:"Malgun Gothic",sans-serif;margin:24px;color:#333}
h1{font-size:14pt}ul{list-style:none;padding:0;line-height:1.9}
a{color:#1980f9;text-decoration:none}a:hover{text-decoration:underline}</style>
</head><body><h1>${urlPath}</h1><ul>${rows.join("\n")}</ul></body></html>`);
  });
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split("?")[0]);
  } catch {
    res.writeHead(400);
    return res.end("Bad Request");
  }
  const fsPath = path.join(ROOT, urlPath);
  if (!fsPath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.stat(fsPath, (err, st) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not Found: " + urlPath);
    }
    if (st.isDirectory()) {
      // 폴더는 끝에 / 를 붙여야 문서 안의 상대 경로가 올바르게 풀린다
      if (!urlPath.endsWith("/")) {
        res.writeHead(301, { Location: encodeURI(urlPath) + "/" });
        return res.end();
      }
      const idx = path.join(fsPath, "index.html");
      if (fs.existsSync(idx)) return sendFile(idx, res);
      return sendListing(fsPath, urlPath, res);
    }
    sendFile(fsPath, res);
  });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error("포트 " + PORT + " 이(가) 이미 사용 중입니다. 서버가 이미 켜져 있는지 확인하세요.");
  } else {
    console.error(err.message);
  }
  process.exitCode = 1;
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("serving " + ROOT);
  console.log("open http://localhost:" + PORT + "/");
});
