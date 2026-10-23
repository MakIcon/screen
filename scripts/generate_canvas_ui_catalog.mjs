// Regenerate after updating the vendored @canvas-ui React registry components.
// Optional first argument: path to an upstream canvas-ui checkout (for demo slider ranges).
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const directory = "src/components/canvasui";
const upstream = process.argv[2];
const slug = (name) => name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
const label = (name) =>
  name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (s) => s.toUpperCase());
const catalog = [];
let constants = new Map();
const literal = (node) => {
  if (!node) return undefined;
  if (ts.isIdentifier(node) && node.text === "PRINTABLE_ASCII")
    return Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("");
  if (ts.isIdentifier(node) && constants.has(node.text)) return literal(constants.get(node.text));
  if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node))
    return literal(node.expression);
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node))
    return ts.isNumericLiteral(node) ? Number(node.text) : node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken)
    return -literal(node.operand);
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node))
    return Object.fromEntries(
      node.properties
        .filter(ts.isPropertyAssignment)
        .map((p) => [p.name.getText().replaceAll('"', ""), literal(p.initializer)]),
    );
  return undefined;
};

for (const file of fs.readdirSync(directory).filter((name) => name.endsWith(".tsx"))) {
  const name = path.basename(file, ".tsx");
  const id = slug(name);
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(path.join(directory, file), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const aliases = new Map(
    source.statements.filter(ts.isTypeAliasDeclaration).map((n) => [n.name.text, n.type]),
  );
  constants = new Map(
    source.statements
      .filter(ts.isVariableStatement)
      .flatMap((s) => s.declarationList.declarations)
      .map((d) => [d.name.getText(), d.initializer]),
  );
  const defaultsNode = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((s) => s.declarationList.declarations)
    .find((d) => d.name.getText() === "DEFAULTS");
  const defaults = literal(defaultsNode?.initializer) ?? {};
  const declaration = source.statements.find(
    (n) =>
      (ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) &&
      n.name.text === `${name}Options`,
  );
  const options =
    declaration && ts.isTypeAliasDeclaration(declaration) ? declaration.type : declaration;
  if (!options) throw new Error(`No options interface for ${name}`);
  const demoFields = new Map();
  const demoPath = upstream && path.join(upstream, "src/demos", `${id}-demo.tsx`);
  if (demoPath && fs.existsSync(demoPath)) {
    const demo = ts.createSourceFile(
      demoPath,
      fs.readFileSync(demoPath, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (node) => {
      if (ts.isPropertyAssignment(node) && ts.isCallExpression(node.initializer)) {
        const call = node.initializer;
        if (
          ["scrub", "color", "toggle", "radio", "select"].includes(call.expression.getText(demo))
        ) {
          demoFields.set(node.name.getText(demo), {
            label: literal(call.arguments[0]),
            range: literal(call.arguments[2]),
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(demo);
  }
  const literals = (type) => {
    if (ts.isTypeReferenceNode(type) && aliases.has(type.typeName.getText()))
      return literals(aliases.get(type.typeName.getText()));
    if (ts.isUnionTypeNode(type)) return type.types.flatMap(literals);
    if (ts.isLiteralTypeNode(type)) {
      const value = literal(type.literal);
      return value === undefined ? [] : [value];
    }
    return [];
  };
  const fields = options.members.flatMap((member) => {
    const key = member.name.getText(source);
    if (/^on[A-Z]/.test(key) || key === "dracoDecoderPath") return [];
    const value = defaults[key];
    if (value === undefined) throw new Error(`Missing default for ${name}.${key}`);
    const choices = literals(member.type);
    const demo = demoFields.get(key);
    const help =
      member.jsDoc?.map((doc) => (typeof doc.comment === "string" ? doc.comment : "")).join(" ") ??
      "";
    let kind = choices.length > 1 ? "select" : typeof value;
    if (Array.isArray(value))
      kind = key === "glyphs" ? "glyphs" : value.length === 3 ? "rgb" : "vector";
    if (
      typeof value === "string" &&
      !choices.length &&
      /color|tint|background|highlight/i.test(key) &&
      /^(#|auto|$)/.test(value)
    )
      kind = "color";
    const resolvedType = ts.isTypeReferenceNode(member.type)
      ? (aliases.get(member.type.typeName.getText()) ?? member.type)
      : member.type;
    if (
      resolvedType.getText().includes("number, number, number") &&
      resolvedType.getText().includes('"auto"')
    )
      kind = "rgb-auto";
    if (key === "src" || key === "backgroundImage") kind = "asset";
    const field = { key, label: demo?.label ?? label(key), kind, default: value };
    if (help) field.help = help;
    if (kind === "select") field.choices = choices;
    if (kind === "number") {
      const range = !Array.isArray(demo?.range) ? demo?.range : undefined;
      const fractional = !Number.isInteger(value) || Math.abs(value) <= 2;
      field.min = range?.min ?? (value < 0 ? Math.min(value * 2, -1) : 0);
      field.max = range?.max ?? (Math.abs(value) <= 1 ? 1 : Math.max(5, Math.abs(value) * 4));
      field.step = range?.step ?? (fractional ? 0.01 : 1);
      if (/Resolution$/.test(key)) {
        field.min = 16;
        field.max = key === "dyeResolution" ? 1024 : 512;
        field.step = 16;
      }
      if (key === "count") field.max = Math.min(field.max, 100000);
      // Engine defaults sometimes extend beyond the demo's narrower UI range.
      field.min = Math.min(field.min, value);
      field.max = Math.max(field.max, value);
    }
    return [field];
  });
  catalog.push({
    id,
    name: name === "VHS" ? "VHS" : label(name).replace(/^Ascii /, "ASCII "),
    component: name,
    object: id.endsWith("-object"),
    fields,
  });
}

fs.writeFileSync("src/appearance/canvasUiCatalog.json", JSON.stringify(catalog, null, 2) + "\n");
fs.writeFileSync(
  "src/appearance/canvasUiLoaders.ts",
  `// Generated by scripts/generate_canvas_ui_catalog.mjs. Engines load only when selected.\nexport const canvasUiLoaders = {\n${catalog.map((c) => `  "${c.id}": () => import("../components/canvasui/${c.component}"),`).join("\n")}\n};\n`,
);
console.log(
  `${catalog.length} Canvas UI effects, ${catalog.reduce((sum, c) => sum + c.fields.length, 0)} editable parameters.`,
);
console.log([...new Set(catalog.flatMap((c) => c.fields.map((f) => f.label)))].sort().join(" | "));
