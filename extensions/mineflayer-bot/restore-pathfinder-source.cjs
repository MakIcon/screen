// Restore the corresponding editable source shipped with this extension.
const fs = require("node:fs");
const path = require("node:path");
const source = JSON.parse(fs.readFileSync(path.join(__dirname, "pathfinder-source.json"), "utf8"));
const output = path.resolve(process.argv[2] || path.join(__dirname, "pathfinder-source"));
for (const [name, content] of Object.entries(source.files)) {
  const target = path.resolve(output, name);
  if (!target.startsWith(output + path.sep)) throw new Error("Invalid source path: " + name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}
process.stdout.write(output + "\n");
