import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Product names, formats, shortcuts, and code examples are intentionally untranslated.
const TECHNICAL_TEXT = new Set([
  "ScreenLauncher",
  "SCREENLAUNCHER",
  "Minecraft",
  "MINECRAFT",
  "Modrinth",
  "MODRINTH",
  "Fabric",
  "FABRIC",
  "Fabric API",
  "Quilt",
  "QUILT",
  "Forge",
  "FORGE",
  "NeoForge",
  "NEOFORGE",
  "Vanilla",
  "VANILLA",
  "Iris",
  "IRIS",
  "Sodium",
  "BlueMap",
  "Discord",
  "Microsoft",
  "OBS",
  "GPU",
  "CPU",
  "JVM",
  "JAR",
  "JAVA",
  "Java",
  "JSON",
  "URL",
  "URI",
  "PID",
  "API",
  "RGB",
  "RGBA",
  "HSL",
  "HSLA",
  "HEX",
  "Hex",
  "CSS",
  "HTML",
  "SVG",
  "PNG",
  "GLB",
  "GLTF",
  "ASCII",
  "VHS",
  "GB",
  "MB",
  "KB",
  "TB",
  "PX",
  "px",
  "ms",
  "fps",
  "FPS",
  "SECS",
  "WIP",
  "Inter",
  "INTER",
  "SEGOE UI",
  "ARIAL",
  "GEORGIA",
  "JETBRAINS MONO",
  "PLAYFAIR",
  "MONO",
  "Aa",
  "ABC",
  "Ctrl+Z",
  "Ctrl+Shift+Z",
  "Shift",
  "Alt+F4",
  "Minecraft Java",
  "SCREENLAUNCHER /",
  "/ MODRINTH",
  "PIXEL",
  "MICROSOFT",
  "Mineflayer Bot",
  "EXT",
  "alt",
]);
// Literal examples must retain working commands, identifiers, file paths, and asset keys.
const TECHNICAL_EXAMPLES = {
  "src/components/builds/BuildEnvironmentVariablesEditor.tsx": ["VARIABLE_NAME"],
  "src/components/builds/BuildRuntimeSettingsEditor.tsx": ["G1, gc, heap"],
  "src/components/plugins/blueMap/BlueMapPlugin.tsx": ["java"],
  "src/components/plugins/discordRpc/DiscordRpcPlugin.tsx": ["minecraft", "launcher"],
  "src/components/plugins/mineflayerBot/MineflayerBotPlugin.tsx": [
    "FriendOne, ModeratorTwo",
    "say text",
    "quit",
  ],
  "src/components/plugins/proxy/ProxyPlugin.tsx": ["localhost, 127.0.0.1, .example.com 10.0.0.0/8"],
  "src/updater/LauncherUpdateOverlay.tsx": ["screen", "launcher"],
};
const UI_ATTRIBUTES = new Set([
  "label",
  "title",
  "placeholder",
  "aria-label",
  "ariaLabel",
  "data-tooltip",
  "note",
  "description",
  "hint",
  "emptyText",
  "colorLabel",
  "data-mascot-label",
]);

function humanText(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!/[A-Za-zА-Яа-яЁё]{2}/.test(clean) || TECHNICAL_TEXT.has(clean)) return false;
  if (
    /^(?:[a-z][a-z0-9+.-]*:\/\/|[a-z]:\\|![a-z]+\s|#[0-9a-f]{3,8}$|\^?%[a-z_]+%$|(?:rgba?|hsla?)\()/i.test(
      clean,
    )
  )
    return false;
  if (/^\.[a-z]+(?:\s*\/\s*\.[a-z]+)*$/i.test(clean)) return false;
  return true;
}

function renderedValue(node, source) {
  let current = node;
  for (let parent = node.parent; parent; current = parent, parent = parent.parent) {
    if (ts.isJsxExpression(parent)) {
      return (
        !ts.isJsxAttribute(parent.parent) || UI_ATTRIBUTES.has(parent.parent.name.getText(source))
      );
    }
    if (ts.isConditionalExpression(parent)) {
      if (parent.condition === current) return false;
    } else if (ts.isBinaryExpression(parent)) {
      const op = parent.operatorToken.kind;
      if (
        ![
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
          ts.SyntaxKind.PlusToken,
          ts.SyntaxKind.AmpersandAmpersandToken,
        ].includes(op)
      )
        return false;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken && parent.left === current) return false;
    } else if (!ts.isParenthesizedExpression(parent)) return false;
  }
  return false;
}

/** Conservative syntax checks: content from users, servers, and files is never treated as UI copy. */
export function findUnlocalizedUi(code, fileName = "component.tsx") {
  const source = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const problems = [];
  function report(node, text) {
    if (!humanText(text)) return;
    if (
      TECHNICAL_EXAMPLES[fileName.replaceAll("\\", "/")]?.includes(text.replace(/\s+/g, " ").trim())
    )
      return;
    problems.push({
      file: fileName.replaceAll("\\", "/"),
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      text: text.replace(/\s+/g, " ").trim(),
    });
  }
  function visit(node) {
    if (ts.isJsxText(node)) report(node, node.text);
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (ts.isJsxAttribute(node.parent) && UI_ATTRIBUTES.has(node.parent.name.getText(source)))
        report(node, node.text);
      else if (renderedValue(node, source)) report(node, node.text);
    } else if (ts.isTemplateExpression(node) && renderedValue(node, source)) {
      const staticText = [
        node.head.text,
        ...node.templateSpans.map((span) => span.literal.text),
      ].join(" ");
      report(node, staticText);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return problems;
}

export function findUnlocalizedMetadata(code, knownLabels, fileName = "metadata.ts") {
  const source = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const problems = [];
  function check(node, text = node.text) {
    if (!humanText(text) || knownLabels.has(text)) return;
    problems.push({
      file: fileName.replaceAll("\\", "/"),
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      text,
    });
  }
  function visit(node) {
    if (
      ts.isPropertyAssignment(node) &&
      [
        "label",
        "note",
        "description",
        "detail",
        "caption",
        "title",
        "name",
        "interaction",
      ].includes(node.name.getText(source).replaceAll('"', "")) &&
      ts.isStringLiteral(node.initializer)
    )
      check(node.initializer);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return problems;
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.(?:ts|tsx)$/.test(file) && !/\.test\./.test(file) ? [file] : [];
  });
}

export function checkLocalization(root = process.cwd()) {
  const keyFile = path.join(root, "src/appearance/localizationKeys.ts");
  const keySource = ts.createSourceFile(
    keyFile,
    fs.readFileSync(keyFile, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const labels = new Set();
  function visitKey(node) {
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isStringLiteral(node.name) || ts.isIdentifier(node.name))
    )
      labels.add(node.name.text);
    ts.forEachChild(node, visitKey);
  }
  visitKey(keySource);
  return sourceFiles(path.join(root, "src"))
    .filter((file) => !file.includes(`${path.sep}i18n${path.sep}`))
    .flatMap((file) => {
      const code = fs.readFileSync(file, "utf8");
      const relative = path.relative(root, file).replaceAll("\\", "/");
      const metadata =
        (relative.startsWith("src/appearance/") || relative.includes("/gradient-editor/")) &&
        !relative.includes("localization")
          ? findUnlocalizedMetadata(code, labels, relative)
          : [];
      return [...findUnlocalizedUi(code, relative), ...metadata];
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = checkLocalization();
  for (const problem of problems)
    console.error(`${problem.file}:${problem.line} Unlocalized UI: ${problem.text}`);
  if (problems.length) process.exitCode = 1;
  else
    console.log("Localization check passed: UI literals are translated or explicitly technical.");
}
