const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const host = "127.0.0.1";
const port = 8123;

const mimeTypes = {
  ".html": "text/html; charset=UTF-8",
  ".js": "text/javascript; charset=UTF-8",
  ".css": "text/css; charset=UTF-8",
  ".json": "application/json; charset=UTF-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

/**
 * @brief リクエストパスから配信対象の絶対パスを返す
 * @param {string} urlPath リクエストパス
 * @returns {string}
 */
function resolveFilePath(urlPath) {
  const safePath = urlPath === "/" ? "/index.html" : decodeURIComponent(urlPath);
  const normalizedPath = path.normalize(safePath).replace(/^([.][.][/\\])+/, "");
  return path.join(root, normalizedPath);
}

const server = http.createServer((request, response) => {
  const filePath = resolveFilePath(request.url || "/");

  if (!filePath.startsWith(root)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=UTF-8" });
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=UTF-8" });
      response.end("Not found");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(data);
  });
});

server.listen(port, host, () => {
  console.log(`ScoreManager server: http://${host}:${port}`);
});
