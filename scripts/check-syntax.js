const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const roots = ["src", "public/js", "scripts"];
const files = [];

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collect(fullPath);
    } else if (entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }
}

for (const root of roots) {
  collect(path.resolve(process.cwd(), root));
}

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log(`Syntax check passed for ${files.length} JavaScript files.`);
