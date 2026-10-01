// Checks formula entry shape; chemical equivalence is evaluated against the canonical answer elsewhere.
export function formulaSyntaxValid(value, { allowCharge = false } = {}) {
  if (typeof value !== "string") return false;
  let body = value.normalize("NFKC").replace(/\s/g, "");
  if (allowCharge) body = body.replace(/(?:[1-9]\d*)?[+-]$/, "");
  if (!body || !/^[A-Za-z0-9()[\]]+$/.test(body) || !/[A-Za-z]/.test(body)) return false;
  const stack = [];
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === "(" || char === "[") stack.push({ char, index });
    else if (char === ")" || char === "]") {
      const group = stack.pop();
      if (!group || group.char !== (char === ")" ? "(" : "[") || group.index === index - 1) return false;
    }
  }
  return stack.length === 0;
}
