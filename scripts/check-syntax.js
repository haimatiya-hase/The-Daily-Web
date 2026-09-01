// Load filesystem and process helpers.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// Check only project JavaScript folders.
const roots = ["src", "public/js", "scripts", "test", "tests"]; // Include both shared and Reporter test folders in syntax checks.
const files = [];

// Collect JavaScript files recursively.
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
  // Resolve each project folder relative to the command's working directory.
  const absoluteRoot = path.resolve(process.cwd(), root); // Build the full folder path once.
  if (fs.existsSync(absoluteRoot)) collect(absoluteRoot); // Check optional folders only when they exist.
}

// Run Node's built-in syntax checker for each file.
for (const file of files) {
  // Ask Node to parse the file without executing application code.
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) {
    // Stop at the first syntax error and keep its failure status.
    process.exit(result.status || 1);
  }
}

console.log(`Syntax check passed for ${files.length} JavaScript files.`);
