"""Parse Python module boundaries without importing application code."""
import ast
import json
import sys

request = json.load(sys.stdin)
violations = []
def forbidden_name(name, forbidden):
    return name == forbidden or name.startswith(forbidden + ".") or ("." + forbidden + ".") in ("." + name + ".")

for item in request:
    tree = ast.parse(item["source"], filename=item["file"])
    loaders = {"__import__"}
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "importlib":
            loaders.update(alias.asname or alias.name for alias in node.names if alias.name == "import_module")
    changed = True
    while changed:
        changed = False
        for node in ast.walk(tree):
            if isinstance(node, (ast.Assign, ast.AnnAssign, ast.NamedExpr)) and (
                isinstance(node.value, ast.Name) and node.value.id in loaders or
                isinstance(node.value, ast.Attribute) and node.value.attr == "import_module"
            ):
                for target in (node.targets if isinstance(node, ast.Assign) else [node.target]):
                    if isinstance(target, ast.Name) and target.id not in loaders:
                        loaders.add(target.id)
                        changed = True
    def module_name(node):
        if not node.args or not isinstance(node.args[0], ast.Constant) or not isinstance(node.args[0].value, str):
            return "<dynamic>"
        name = node.args[0].value
        if not name.startswith("."):
            return name
        package = node.args[1] if len(node.args) > 1 else next((kw.value for kw in node.keywords if kw.arg == "package"), None)
        if not isinstance(package, ast.Constant) or not isinstance(package.value, str):
            return "<dynamic>"
        level = len(name) - len(name.lstrip("."))
        parts = package.value.split(".")
        if level > len(parts):
            return "<dynamic>"
        return ".".join(parts[:len(parts)-level+1] + [name.lstrip(".")]).rstrip(".")
    for node in ast.walk(tree):
        names = []
        if isinstance(node, ast.Import):
            names = [alias.name for alias in node.names]
        elif isinstance(node, ast.ImportFrom):
            package = item["file"].replace("/", ".").rsplit(".", 1)[0].rsplit(".", 1)[0].split(".")
            base = package[:len(package) - node.level + 1] if node.level else []
            module = ".".join(base + ([node.module] if node.module else []))
            names = [module] + [module + "." + alias.name for alias in node.names]
        elif isinstance(node, ast.Call) and (
            isinstance(node.func, ast.Name) and node.func.id in loaders or
            isinstance(node.func, ast.NamedExpr) and isinstance(node.func.target, ast.Name) and node.func.target.id in loaders
        ):
            names = [module_name(node)]
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "import_module":
            names = [module_name(node)]
        for rule in item["rules"]:
            if any(name == "<dynamic>" or any(forbidden_name(name, forbidden) for forbidden in rule.get("imports", [])) for name in names):
                violations.append({"file": item["file"], "line": node.lineno, "rule": rule["id"], "detail": "forbidden import: " + ", ".join(names), "guidance": rule["guidance"]})
json.dump(violations, sys.stdout)
