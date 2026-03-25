export type Representation = "html" | "markdown";

type MarkdownMediaType = "markdown" | "plain";

export interface NegotiatedRepresentation {
  representation: Representation;
  markdownMediaType: MarkdownMediaType;
  varyAccept: boolean;
}

export type NegotiationError =
  | {
    kind: "unsupported_format";
    requested: string;
    supported: Representation[];
  }
  | {
    kind: "not_acceptable";
    accept: string;
    supported: Representation[];
  };

export type ActionMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface ActionField {
  name: string;
  required?: boolean;
  description?: string;
}

export interface Action {
  method: ActionMethod;
  path: string;
  description: string;
  fields?: ActionField[];
  requires?: string;
  effect?: string;
}

export interface Hint {
  text: string;
}

interface AcceptToken {
  mediaType: string;
  q: number;
}

interface AcceptCandidate {
  representation: Representation;
  markdownMediaType: MarkdownMediaType;
  q: number;
  specificity: number;
  tokenIndex: number;
  supportedIndex: number;
  isDefault: boolean;
}

export function queryFormatValue(selection: NegotiatedRepresentation): "html" | "md" | "text" {
  if (selection.representation === "html") return "html";
  return selection.markdownMediaType === "plain" ? "text" : "md";
}

export function preferredAcceptValue(selection: NegotiatedRepresentation): string {
  if (selection.representation === "html") return "text/html";
  return selection.markdownMediaType === "plain" ? "text/plain" : "text/markdown";
}

export function responseContentType(selection: NegotiatedRepresentation): string {
  if (selection.representation === "html") return "text/html; charset=utf-8";
  return selection.markdownMediaType === "plain"
    ? "text/plain; charset=utf-8"
    : "text/markdown; charset=utf-8";
}

export function preferredRepresentation(
  request: Request,
  supported: Representation[],
  defaultRepresentation: Representation,
): NegotiatedRepresentation | NegotiationError {
  const defaultSelection = supported.includes(defaultRepresentation)
    ? defaultRepresentation
    : (supported[0] ?? defaultRepresentation);
  const url = new URL(request.url);
  const rawFormat = url.searchParams.get("format");

  if (rawFormat) {
    const selection = parseQueryFormat(rawFormat);
    if (!selection) {
      return {
        kind: "unsupported_format",
        requested: rawFormat,
        supported,
      };
    }
    if (!supported.includes(selection.representation)) {
      return {
        kind: "unsupported_format",
        requested: rawFormat,
        supported,
      };
    }
    return selection;
  }

  const accept = request.headers.get("Accept")?.trim() ?? "";
  if (!accept) {
    return newSelection(defaultSelection);
  }

  const tokens = parseAccept(accept);
  const selection = bestAcceptMatch(tokens, supported, defaultSelection);
  if (!selection) {
    return {
      kind: "not_acceptable",
      accept,
      supported,
    };
  }
  return selection;
}

export function negotiationErrorResponse(error: NegotiationError): Response {
  const supportedFormats = supportedFormatLabels(error.supported).join(", ");
  const message = error.kind === "unsupported_format"
    ? `Requested format \"${error.requested}\" is not available here. Supported formats: ${supportedFormats}`
    : `Accept \"${error.accept}\" is not available here. Supported formats: ${supportedFormats}`;

  const response = new Response(message, {
    status: 406,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });

  if (error.kind === "not_acceptable") {
    appendVaryAccept(response.headers);
  }

  return response;
}

export function markdownResponse(
  body: string,
  selection: NegotiatedRepresentation,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", responseContentType(selection));
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "no-cache");
  }
  if (selection.varyAccept) {
    appendVaryAccept(headers);
  }
  return new Response(body, {
    ...init,
    headers,
  });
}

export function appendNegotiatedFormat(path: string, selection: NegotiatedRepresentation): string {
  return appendFormatValue(path, queryFormatValue(selection));
}

export function textNavigationHint(selection: NegotiatedRepresentation): Hint {
  return {
    text: `GET paths below omit \`?format\`. Keep \`Accept: ${preferredAcceptValue(selection)}\` to stay in this view, or append \`?format=${queryFormatValue(selection)}\` when following a path without headers.`,
  };
}

export function renderActionsSection(actions: Action[]): string {
  if (actions.length === 0) return "";

  const lines = ["## Actions", ...actions.map(renderActionLine)];
  return lines.join("\n");
}

export function renderHintsSection(hints: Hint[]): string {
  if (hints.length === 0) return "";

  const lines = ["## Hints", ...hints.map((hint) => `- ${hint.text}`)];
  return lines.join("\n");
}

function newSelection(representation: Representation): NegotiatedRepresentation {
  return {
    representation,
    markdownMediaType: "markdown",
    varyAccept: false,
  };
}

function parseQueryFormat(value: string): NegotiatedRepresentation | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "html") return newSelection("html");
  if (normalized === "md" || normalized === "markdown") return newSelection("markdown");
  if (normalized === "text" || normalized === "txt" || normalized === "plain") {
    return {
      representation: "markdown",
      markdownMediaType: "plain",
      varyAccept: false,
    };
  }
  return null;
}

function parseAccept(header: string): AcceptToken[] {
  return header
    .split(",")
    .map((rawToken) => {
      const parts = rawToken.split(";");
      const mediaType = (parts.shift() ?? "").trim().toLowerCase();
      let q = 1000;

      for (const part of parts) {
        const [key, value] = part.split("=");
        if (key?.trim().toLowerCase() !== "q") continue;
        q = parseQuality(value?.trim() ?? "") ?? 0;
      }

      return { mediaType, q };
    })
    .filter((token) => token.mediaType.length > 0);
}

function parseQuality(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return null;
  return Math.round(parsed * 1000);
}

function bestAcceptMatch(
  tokens: AcceptToken[],
  supported: Representation[],
  defaultRepresentation: Representation,
): NegotiatedRepresentation | null {
  let best: AcceptCandidate | null = null;

  for (const [supportedIndex, representation] of supported.entries()) {
    const match = bestTokenForRepresentation(representation, tokens);
    if (!match) continue;

    const candidate: AcceptCandidate = {
      representation,
      markdownMediaType: match.markdownMediaType,
      q: match.q,
      specificity: match.specificity,
      tokenIndex: match.tokenIndex,
      supportedIndex,
      isDefault: representation === defaultRepresentation,
    };

    if (!best || isBetterAcceptCandidate(candidate, best)) {
      best = candidate;
    }
  }

  if (!best) return null;
  return {
    representation: best.representation,
    markdownMediaType: best.markdownMediaType,
    varyAccept: true,
  };
}

function bestTokenForRepresentation(
  representation: Representation,
  tokens: AcceptToken[],
): {
  q: number;
  specificity: number;
  tokenIndex: number;
  markdownMediaType: MarkdownMediaType;
} | null {
  let best: {
    q: number;
    specificity: number;
    tokenIndex: number;
    markdownMediaType: MarkdownMediaType;
  } | null = null;

  for (const [tokenIndex, token] of tokens.entries()) {
    if (token.q === 0) continue;

    const match = matchRepresentation(representation, token.mediaType);
    if (!match) continue;

    const candidate = {
      q: token.q,
      specificity: match.specificity,
      tokenIndex,
      markdownMediaType: match.markdownMediaType,
    };

    if (!best || isBetterTokenCandidate(candidate, best)) {
      best = candidate;
    }
  }

  return best;
}

function matchRepresentation(
  representation: Representation,
  mediaType: string,
): {
  specificity: number;
  markdownMediaType: MarkdownMediaType;
} | null {
  if (representation === "html") {
    if (mediaType === "text/html") return { specificity: 3, markdownMediaType: "markdown" };
    if (mediaType === "text/*") return { specificity: 1, markdownMediaType: "markdown" };
    if (mediaType === "*/*") return { specificity: 0, markdownMediaType: "markdown" };
    return null;
  }

  if (mediaType === "text/markdown") return { specificity: 3, markdownMediaType: "markdown" };
  if (mediaType === "text/plain") return { specificity: 3, markdownMediaType: "plain" };
  if (mediaType === "text/*") return { specificity: 1, markdownMediaType: "markdown" };
  if (mediaType === "*/*") return { specificity: 0, markdownMediaType: "markdown" };
  return null;
}

function isBetterTokenCandidate(
  candidate: {
    q: number;
    specificity: number;
    tokenIndex: number;
  },
  current: {
    q: number;
    specificity: number;
    tokenIndex: number;
  },
): boolean {
  return candidate.q > current.q ||
    (candidate.q === current.q && candidate.specificity > current.specificity) ||
    (candidate.q === current.q &&
      candidate.specificity === current.specificity &&
      candidate.tokenIndex < current.tokenIndex);
}

function isBetterAcceptCandidate(candidate: AcceptCandidate, current: AcceptCandidate): boolean {
  return candidate.q > current.q ||
    (candidate.q === current.q && candidate.specificity > current.specificity) ||
    (candidate.q === current.q &&
      candidate.specificity === current.specificity &&
      candidate.tokenIndex < current.tokenIndex) ||
    (candidate.q === current.q &&
      candidate.specificity === current.specificity &&
      candidate.tokenIndex === current.tokenIndex &&
      candidate.isDefault &&
      !current.isDefault) ||
    (candidate.q === current.q &&
      candidate.specificity === current.specificity &&
      candidate.tokenIndex === current.tokenIndex &&
      candidate.isDefault === current.isDefault &&
      candidate.supportedIndex < current.supportedIndex);
}

function supportedFormatLabels(supported: Representation[]): string[] {
  return supported.map((representation) => representation === "markdown" ? "md" : "html");
}

function renderActionLine(action: Action): string {
  let line = `- ${action.method} \`${action.path}\` - ${action.description}`;

  if (action.fields && action.fields.length > 0) {
    const fields = action.fields.map((field) => {
      const label = `\`${field.name}\`${field.required === false ? " (optional)" : ""}`;
      return field.description ? `${label} - ${field.description}` : label;
    }).join(", ");
    line += `; fields: ${fields}`;
  }

  if (action.requires) {
    line += `; requires ${action.requires}`;
  }

  if (action.effect) {
    line += `; ${action.effect}`;
  }

  return line;
}

function appendFormatValue(path: string, formatValue: string): string {
  const [pathWithoutFragment, fragment = ""] = path.split("#", 2);
  const [base, query = ""] = pathWithoutFragment.split("?", 2);
  const params = query
    .split("&")
    .filter(Boolean)
    .filter((segment) => segment.split("=")[0] !== "format");

  params.push(`format=${formatValue}`);

  const next = `${base}?${params.join("&")}`;
  return fragment ? `${next}#${fragment}` : next;
}

function appendVaryAccept(headers: Headers): void {
  const vary = headers.get("Vary") ?? "";
  const values = vary
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!values.some((value) => value.toLowerCase() === "accept")) {
    values.push("Accept");
  }

  headers.set("Vary", values.join(", "));
}
