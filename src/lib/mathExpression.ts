export type MathScope = Record<string, number>;
export type CompiledMathExpression = (scope?: MathScope) => number;

type Token =
  | { type: "number"; value: number }
  | { type: "id"; value: string }
  | { type: "op"; value: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "comma" };

type EvalFn = (scope: MathScope) => number;

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  arcsin: Math.asin,
  arccos: Math.acos,
  arctan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  log: Math.log,
  ln: Math.log,
  log10: Math.log10,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign,
  min: Math.min,
  max: Math.max,
  sec: (x) => 1 / Math.cos(x),
  csc: (x) => 1 / Math.sin(x),
  cosec: (x) => 1 / Math.sin(x),
  cot: (x) => 1 / Math.tan(x),
};

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

const ALLOWED_VARIABLES = new Set(["x", "y", "t", "theta"]);

export function normalizeMathText(input: string) {
  return input
    .trim()
    .replace(/[−–—]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/g, "pi")
    .replace(/θ/g, "theta")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/\*\*/g, "^");
}

function tokenize(raw: string): Token[] {
  const input = normalizeMathText(raw);
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      const match = input.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
      if (!match) throw new Error(`Invalid number near “${input.slice(i, i + 8)}”`);
      const value = Number(match[0]);
      if (!Number.isFinite(value)) throw new Error("Number is too large.");
      tokens.push({ type: "number", value });
      i += match[0].length;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      const match = input.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/)!;
      tokens.push({ type: "id", value: match[0].toLowerCase() });
      i += match[0].length;
      continue;
    }

    if ("+-*/^%".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i += 1;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen" });
      i += 1;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "comma" });
      i += 1;
      continue;
    }

    throw new Error(`Unsupported symbol “${ch}”.`);
  }

  const withImplicitMultiplication: Token[] = [];
  for (const token of tokens) {
    const previous = withImplicitMultiplication[withImplicitMultiplication.length - 1];
    if (previous && needsImplicitMultiply(previous, token)) {
      withImplicitMultiplication.push({ type: "op", value: "*" });
    }
    withImplicitMultiplication.push(token);
  }
  return withImplicitMultiplication;
}

function needsImplicitMultiply(previous: Token, current: Token) {
  const previousEndsValue = previous.type === "number" || previous.type === "id" || previous.type === "rparen";
  const currentStartsValue = current.type === "number" || current.type === "id" || current.type === "lparen";
  if (!previousEndsValue || !currentStartsValue) return false;
  if (previous.type === "id" && current.type === "lparen" && Object.prototype.hasOwnProperty.call(FUNCTIONS, previous.value)) return false;
  return true;
}

class Parser {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): EvalFn {
    if (this.tokens.length === 0) throw new Error("Enter an expression first.");
    const result = this.parseAddSubtract();
    if (this.index !== this.tokens.length) throw new Error("Please check the expression syntax.");
    return result;
  }

  private peek() {
    return this.tokens[this.index];
  }

  private take() {
    return this.tokens[this.index++];
  }

  private parseAddSubtract(): EvalFn {
    let left = this.parseMultiplyDivide();
    while (this.peek()?.type === "op" && ["+", "-"].includes((this.peek() as { type: "op"; value: string }).value)) {
      const op = (this.take() as { type: "op"; value: string }).value;
      const right = this.parseMultiplyDivide();
      const previous = left;
      left = op === "+" ? (scope) => previous(scope) + right(scope) : (scope) => previous(scope) - right(scope);
    }
    return left;
  }

  private parseMultiplyDivide(): EvalFn {
    let left = this.parseUnary();
    while (this.peek()?.type === "op" && ["*", "/", "%"].includes((this.peek() as { type: "op"; value: string }).value)) {
      const op = (this.take() as { type: "op"; value: string }).value;
      const right = this.parseUnary();
      const previous = left;
      if (op === "*") left = (scope) => previous(scope) * right(scope);
      else if (op === "/") left = (scope) => previous(scope) / right(scope);
      else left = (scope) => previous(scope) % right(scope);
    }
    return left;
  }

  private parseUnary(): EvalFn {
    const token = this.peek();
    if (token?.type === "op" && (token.value === "+" || token.value === "-")) {
      this.take();
      const inner = this.parseUnary();
      return token.value === "+" ? inner : (scope) => -inner(scope);
    }
    return this.parsePower();
  }

  private parsePower(): EvalFn {
    let left = this.parsePrimary();
    if (this.peek()?.type === "op" && (this.peek() as { type: "op"; value: string }).value === "^") {
      this.take();
      const right = this.parseUnary();
      const previous = left;
      left = (scope) => Math.pow(previous(scope), right(scope));
    }
    return left;
  }

  private parsePrimary(): EvalFn {
    const token = this.take();
    if (!token) throw new Error("Expression ended unexpectedly.");

    if (token.type === "number") return () => token.value;

    if (token.type === "id") {
      const name = token.value;
      if (this.peek()?.type === "lparen") {
        if (!Object.prototype.hasOwnProperty.call(FUNCTIONS, name)) throw new Error(`Function “${name}” is not supported.`);
        const fn = FUNCTIONS[name];
        this.take();
        const args: EvalFn[] = [];
        if (this.peek()?.type !== "rparen") {
          args.push(this.parseAddSubtract());
          while (this.peek()?.type === "comma") {
            this.take();
            args.push(this.parseAddSubtract());
          }
        }
        if (this.take()?.type !== "rparen") throw new Error("Missing closing bracket ).");
        if (args.length === 0) throw new Error(`Function “${name}” needs a value.`);
        return (scope) => fn(...args.map((arg) => arg(scope)));
      }

      if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) return () => CONSTANTS[name];
      if (!ALLOWED_VARIABLES.has(name)) throw new Error(`Variable “${name}” is not supported.`);
      return (scope) => {
        const value = scope[name];
        if (typeof value !== "number") throw new Error(`Variable “${name}” needs a value.`);
        return value;
      };
    }

    if (token.type === "lparen") {
      const inner = this.parseAddSubtract();
      if (this.take()?.type !== "rparen") throw new Error("Missing closing bracket ).");
      return inner;
    }

    throw new Error("Please check the expression syntax.");
  }
}

export function compileMathExpression(input: string): CompiledMathExpression {
  const evaluator = new Parser(tokenize(input)).parse();
  return (scope = {}) => evaluator(scope);
}

export function evaluateConstant(input: string) {
  const compiled = compileMathExpression(input);
  const value = compiled({});
  if (!Number.isFinite(value)) throw new Error("Range value must be finite.");
  return value;
}

export function stripEquationPrefix(input: string, prefix: "y" | "r" | "x") {
  const normalized = normalizeMathText(input);
  const match = normalized.match(new RegExp(`^\\s*${prefix}\\s*=\\s*(.+)$`, "i"));
  return match ? match[1] : normalized;
}

export function compileImplicitEquation(input: string) {
  const normalized = normalizeMathText(input);
  const pieces = normalized.split("=");
  if (pieces.length !== 2 || !pieces[0].trim() || !pieces[1].trim()) {
    throw new Error("Implicit form example: x^2 + y^2 = 25");
  }
  const left = compileMathExpression(pieces[0]);
  const right = compileMathExpression(pieces[1]);
  return (x: number, y: number) => left({ x, y }) - right({ x, y });
}

export type InequalityRelation = "<" | "<=" | ">" | ">=";

export function compileInequality(input: string) {
  const normalized = normalizeMathText(input);
  const match = normalized.match(/^(.*?)(<=|>=|<|>)(.*)$/);
  if (!match || !match[1].trim() || !match[3].trim()) {
    throw new Error("Inequality example: y >= x^2");
  }
  const left = compileMathExpression(match[1]);
  const right = compileMathExpression(match[3]);
  const relation = match[2] as InequalityRelation;
  const difference = (x: number, y: number) => left({ x, y }) - right({ x, y });
  const test = (x: number, y: number) => {
    const value = difference(x, y);
    if (!Number.isFinite(value)) return false;
    if (relation === "<") return value < 0;
    if (relation === "<=") return value <= 0;
    if (relation === ">") return value > 0;
    return value >= 0;
  };
  return { difference, test, relation };
}
