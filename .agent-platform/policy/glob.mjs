export function matches(value, pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "\u0000").replace(/\*\*/g, "\u0001").replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, "(?:.*/)?").replace(/\u0001/g, ".*");
  return new RegExp(`^${escaped}$`).test(value);
}

export function applies(file, rule) {
  return rule.files.some((pattern) => matches(file, pattern)) &&
    !(rule.except ?? []).some((pattern) => matches(file, pattern));
}
