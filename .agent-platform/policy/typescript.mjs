import { createRequire } from "node:module";
import { resolve, dirname, relative } from "node:path";

export function loadTypeScript(root, explicit) {
  const locations = [explicit, "typescript", "./node_modules/typescript/lib/typescript.js",
    "./frontend/node_modules/typescript/lib/typescript.js", "./apps/api/node_modules/typescript/lib/typescript.js"];
  const require = createRequire(resolve(root, "package.json"));
  for (const location of locations.filter(Boolean)) {
    try { return require(location); } catch { /* try the next installed compiler */ }
  }
  throw new Error("TypeScript compiler unavailable; install pinned dependencies or set AGENT_TYPESCRIPT");
}

export function scanTypeScript(ts, file, source, rules, aliases = {}) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : file.endsWith(".jsx") ? ts.ScriptKind.JSX : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  if (ast.parseDiagnostics.length) throw new Error(`${file}: invalid TypeScript syntax`);
  const violations = [];
  const report = (node, rule, detail) => violations.push({
    file, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
    rule: rule.id, detail, guidance: rule.guidance,
  });
  const imports = [];
  // Track conventional Worker environment roots through simple local aliases.
  // Named binding reads are blocked on every receiver, including function args.
  const constants = new Map();
  const literal = (node, seen = new Set()) => {
    if (!node) return undefined;
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isIdentifier(node) && constants.has(node.text) && !seen.has(node.text)) {
      return literal(constants.get(node.text), new Set([...seen, node.text]));
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = literal(node.left, seen), right = literal(node.right, seen);
      return left !== undefined && right !== undefined ? left + right : undefined;
    }
    return undefined;
  };
  const candidates = new Map(), ambiguous = new Set();
  const collect = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (candidates.has(node.name.text) || !(node.parent.flags & ts.NodeFlags.Const)) ambiguous.add(node.name.text);
      candidates.set(node.name.text, node.initializer);
    }
    if (ts.isParameter(node) && ts.isIdentifier(node.name)) ambiguous.add(node.name.text);
    if (ts.isBinaryExpression(node) && ts.isIdentifier(node.left) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) ambiguous.add(node.left.text);
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && ts.isIdentifier(node.operand)) ambiguous.add(node.operand.text);
    ts.forEachChild(node, collect);
  };
  collect(ast);
  for (const [name, initializer] of candidates) if (!ambiguous.has(name) && initializer) constants.set(name, initializer);
  const roots = new Set(rules.flatMap(rule => rule.bindingRoots ?? ["env", "bindings"]));
  const isRoot = node => node && (ts.isIdentifier(node) && roots.has(node.text) ||
    ts.isPropertyAccessExpression(node) && roots.has(node.name.text) ||
    (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) && isRoot(node.expression));
  let changed;
  do {
    changed = false;
    const aliases = node => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && isRoot(node.initializer) && !roots.has(node.name.text)) {
        roots.add(node.name.text); changed = true;
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isIdentifier(node.left) && isRoot(node.right) && !roots.has(node.left.text)) {
        roots.add(node.left.text); changed = true;
      }
      if (ts.isParameter(node) && ts.isIdentifier(node.name) && node.type &&
          /\b(?:\w*Env|Bindings|Environment)\b/.test(node.type.getText(ast)) && !roots.has(node.name.text)) {
        roots.add(node.name.text); changed = true;
      }
      if (ts.isBindingElement(node) && ts.isIdentifier(node.name) &&
          node.propertyName && ts.isIdentifier(node.propertyName) && roots.has(node.propertyName.text) && !roots.has(node.name.text)) {
        roots.add(node.name.text); changed = true;
      }
      ts.forEachChild(node, aliases);
    };
    aliases(ast);
  } while (changed);
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) imports.push([node, node.moduleSpecifier]);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      imports.push([node, node.argument.literal]);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      imports.push([node, node.moduleReference.expression]);
    } else if (ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(ast) === "require")) {
      imports.push([node, node.arguments[0]]);
    }
    for (const rule of rules) {
      if (rule.properties?.length) {
        let name;
        if (ts.isPropertyAccessExpression(node)) name = node.name.text;
        else if (ts.isElementAccessExpression(node)) {
          name = literal(node.argumentExpression);
          if (!ts.isStringLiteralLike(node.argumentExpression) && isRoot(node.expression)) report(node, rule, "computed binding access is forbidden inside this boundary");
        } else if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
          const key = node.propertyName ?? node.name;
          if (ts.isIdentifier(key) || ts.isStringLiteralLike(key)) name = key.text;
          else if (ts.isComputedPropertyName(key)) {
            if (ts.isStringLiteralLike(key.expression)) name = key.expression.text;
            else report(node, rule, "computed binding destructuring is forbidden inside this boundary");
          }
          if (node.dotDotDotToken && isRoot(node.parent.parent.initializer)) {
            report(node, rule, "binding rest alias is forbidden inside this boundary");
          }
        } else if ((ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) &&
            ts.isObjectLiteralExpression(node.parent) && ts.isBinaryExpression(node.parent.parent) &&
            node.parent.parent.left === node.parent && node.parent.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
          const key = node.name;
          if (ts.isIdentifier(key) || ts.isStringLiteralLike(key)) name = key.text;
          else if (ts.isComputedPropertyName(key)) {
            name = literal(key.expression);
            if (name === undefined && isRoot(node.parent.parent.right)) report(node, rule, "computed binding destructuring is forbidden inside this boundary");
          }
        } else if (ts.isSpreadAssignment(node) && isRoot(node.expression)) {
          report(node, rule, "binding spread alias is forbidden inside this boundary");
        }
        if (rule.properties.includes(name)) report(node, rule, `forbidden binding: ${name}`);
      }
      if (rule.imports?.length && ts.isIdentifier(node) && node.text === "require" &&
          !(ts.isCallExpression(node.parent) && node.parent.expression === node)) {
        report(node, rule, "indirect module loader is forbidden inside this boundary");
      }
      if (rule.references && (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))) {
        if (ts.isIdentifier(node) && ["globalThis", "window", "self"].includes(node.text) &&
            !(ts.isPropertyAccessExpression(node.parent) || ts.isElementAccessExpression(node.parent)) &&
            !ts.isTypeQueryNode(node.parent) && !ts.isTypeOfExpression(node.parent)) {
          report(node, rule, "global aliasing is forbidden inside this boundary");
        }
        if (ts.isElementAccessExpression(node) && ["globalThis", "window", "self"].includes(node.expression.getText(ast)) && !ts.isStringLiteralLike(node.argumentExpression)) {
          report(node, rule, "computed global access is forbidden inside this boundary");
        }
        const text = ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)
          ? `${node.expression.getText(ast)}.${node.argumentExpression.text}` : node.getText(ast);
        if (rule.references.includes(text)) report(node, rule, `forbidden reference: ${text}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  for (const [node, specifier] of imports) {
    for (const rule of rules.filter((rule) => rule.imports?.length)) {
      if (!specifier || !ts.isStringLiteralLike(specifier)) {
        report(node, rule, "nonliteral module loading is forbidden inside this boundary"); continue;
      }
      const name = specifier.text;
      const alias = Object.keys(aliases).find((prefix) => name.startsWith(prefix));
      const resolved = name.startsWith(".")
        ? relative(process.cwd(), resolve(dirname(file), name)).replaceAll("\\", "/")
        : alias ? aliases[alias] + name.slice(alias.length) : name;
      if (["module", "node:module"].includes(name) || rule.imports.some((pattern) => pattern === name || !pattern.startsWith("/") && !pattern.endsWith("/*") && name.startsWith(pattern + "/") || pattern.endsWith("/*") && name.startsWith(pattern.slice(0, -1)) ||
          pattern.startsWith("/") && (resolved === pattern.slice(1) || resolved.startsWith(pattern.slice(1) + "/")))) {
        report(node, rule, `forbidden import: ${name}`);
      }
    }
  }
  return violations;
}
