import * as vscode from "vscode";

const PRESET_TOKENS = [
  "fade-in",
  "fade-out",
  "slide-up",
  "slide-down",
  "slide-left",
  "slide-right",
  "scale-in",
  "scale-out",
  "scale-up",
  "scale-down",
  "bounce",
] as const;

const LAYOUT_TOKENS = [
  "layout-linear",
  "layout-spring",
  "layout-fade",
  "layout-spring-stiff",
  "layout-spring-bouncy",
] as const;

const TRANSITION_TOKENS = [
  "transition",
  "transition-all",
  "transition-colors",
  "transition-opacity",
  "transition-transform",
  "transition-spacing",
  "transition-layout",
] as const;

const COMMON_TIMING_TOKENS = [
  "duration-75",
  "duration-100",
  "duration-150",
  "duration-200",
  "duration-250",
  "duration-300",
  "duration-500",
  "duration-700",
  "duration-1000",

  "delay-75",
  "delay-100",
  "delay-150",
  "delay-200",
  "delay-300",
  "delay-500",

  "repeat-1",
  "repeat-2",
  "repeat-3",
  "repeat-infinite",

  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
] as const;

const MODIFIER_TOKENS = ["from:", "to:", "exit:"] as const;

const OPACITY_TOKENS = [
  "opacity-0",
  "opacity-5",
  "opacity-10",
  "opacity-15",
  "opacity-20",
  "opacity-25",
  "opacity-30",
  "opacity-35",
  "opacity-40",
  "opacity-45",
  "opacity-50",
  "opacity-55",
  "opacity-60",
  "opacity-65",
  "opacity-70",
  "opacity-75",
  "opacity-80",
  "opacity-85",
  "opacity-90",
  "opacity-95",
  "opacity-100",
] as const;

type TokenSuggestion = {
  label: string;
  insertText?: string | vscode.SnippetString;
  detail?: string;
  documentation?: string;
  kind?: vscode.CompletionItemKind;
};

const BASE_SUGGESTIONS: TokenSuggestion[] = [
  ...PRESET_TOKENS.map((label) => ({
    label,
    detail: "STRX animation preset",
  })),
  ...LAYOUT_TOKENS.map((label) => ({
    label,
    detail: "STRX layout animation token",
  })),
  ...TRANSITION_TOKENS.map((label) => ({
    label,
    detail: "STRX transition token",
  })),
  ...COMMON_TIMING_TOKENS.map((label) => ({
    label,
    detail: "STRX timing token",
  })),
  ...MODIFIER_TOKENS.map((label) => ({
    label,
    detail: "STRX keyframe modifier",
  })),

  {
    label: "duration-${number}",
    insertText: new vscode.SnippetString("duration-${1:300}"),
    detail: "STRX custom duration token",
    documentation: "`duration-${number}`",
  },
  {
    label: "delay-${number}",
    insertText: new vscode.SnippetString("delay-${1:100}"),
    detail: "STRX custom delay token",
    documentation: "`delay-${number}`",
  },
  {
    label: "repeat-${number}",
    insertText: new vscode.SnippetString("repeat-${1:1}"),
    detail: "STRX custom repeat token",
    documentation: "`repeat-${number}`",
  },
];

const UTILITY_SUGGESTIONS: TokenSuggestion[] = [
  ...OPACITY_TOKENS.map((label) => ({
    label,
    detail: "STRX opacity utility token",
  })),

  {
    label: "opacity-${number}",
    insertText: new vscode.SnippetString("opacity-${1:50}"),
    detail: "STRX custom opacity utility",
  },

  {
    label: "translate-x-${number}",
    insertText: new vscode.SnippetString("translate-x-${1:16}"),
    detail: "STRX translateX utility",
  },
  {
    label: "-translate-x-${number}",
    insertText: new vscode.SnippetString("-translate-x-${1:16}"),
    detail: "STRX negative translateX utility",
  },
  {
    label: "translate-y-${number}",
    insertText: new vscode.SnippetString("translate-y-${1:16}"),
    detail: "STRX translateY utility",
  },
  {
    label: "-translate-y-${number}",
    insertText: new vscode.SnippetString("-translate-y-${1:16}"),
    detail: "STRX negative translateY utility",
  },

  {
    label: "scale-${number}",
    insertText: new vscode.SnippetString("scale-${1:100}"),
    detail: "STRX scale utility",
  },
  {
    label: "scale-x-${number}",
    insertText: new vscode.SnippetString("scale-x-${1:100}"),
    detail: "STRX scaleX utility",
  },
  {
    label: "scale-y-${number}",
    insertText: new vscode.SnippetString("scale-y-${1:100}"),
    detail: "STRX scaleY utility",
  },

  {
    label: "rotate-${number}",
    insertText: new vscode.SnippetString("rotate-${1:45}"),
    detail: "STRX rotate utility",
  },
  {
    label: "-rotate-${number}",
    insertText: new vscode.SnippetString("-rotate-${1:45}"),
    detail: "STRX negative rotate utility",
  },

  {
    label: "w-${number}",
    insertText: new vscode.SnippetString("w-${1:100}"),
    detail: "STRX width utility",
  },
  {
    label: "h-${number}",
    insertText: new vscode.SnippetString("h-${1:100}"),
    detail: "STRX height utility",
  },
];

const MODIFIER_PREFIXES = ["from:", "to:", "exit:"] as const;

type ModifierPrefix = (typeof MODIFIER_PREFIXES)[number];

type AnimateContext = {
  value: string;
  lastToken: string;
  replaceRange: vscode.Range;
  modifierPrefix?: ModifierPrefix;
};

function getAnimateContext(
  document: vscode.TextDocument,
  position: vscode.Position,
): AnimateContext | undefined {
  const line = document.lineAt(position.line).text;
  const linePrefix = line.slice(0, position.character);

  const match = /\banimate\s*=\s*(?:\{\s*)?(["'`])([^"'`]*)$/.exec(linePrefix);

  if (!match) {
    return undefined;
  }

  const quote = match[1];
  const value = match[2] ?? "";

  const quoteIndex = linePrefix.lastIndexOf(quote);

  if (quoteIndex < 0) {
    return undefined;
  }

  const valueStartCharacter = quoteIndex + 1;

  const lastTokenMatch = /(?:^|\s)(\S*)$/.exec(value);
  const lastToken = lastTokenMatch?.[1] ?? "";

  const tokenStartInValue = value.length - lastToken.length;

  const tokenStartPosition = new vscode.Position(
    position.line,
    valueStartCharacter + tokenStartInValue,
  );

  const replaceRange = new vscode.Range(tokenStartPosition, position);

  const modifierPrefix = MODIFIER_PREFIXES.find((prefix) =>
    lastToken.startsWith(prefix),
  );

  return {
    value,
    lastToken,
    replaceRange,
    modifierPrefix,
  };
}

function withModifierPrefix(
  suggestion: TokenSuggestion,
  prefix: ModifierPrefix,
): TokenSuggestion {
  const insertText =
    suggestion.insertText instanceof vscode.SnippetString
      ? new vscode.SnippetString(`${prefix}${suggestion.insertText.value}`)
      : `${prefix}${suggestion.insertText ?? suggestion.label}`;

  return {
    ...suggestion,
    label: `${prefix}${suggestion.label}`,
    insertText,
    detail: suggestion.detail
      ? `${suggestion.detail} with ${prefix}`
      : `STRX utility token with ${prefix}`,
  };
}

function getSuggestions(context: AnimateContext): TokenSuggestion[] {
  if (context.modifierPrefix) {
    return UTILITY_SUGGESTIONS.map((suggestion) =>
      withModifierPrefix(suggestion, context.modifierPrefix!),
    );
  }

  return BASE_SUGGESTIONS;
}

function createCompletionItem(
  suggestion: TokenSuggestion,
  index: number,
  range: vscode.Range,
): vscode.CompletionItem {
  const item = new vscode.CompletionItem(
    suggestion.label,
    suggestion.kind ?? vscode.CompletionItemKind.Keyword,
  );

  item.range = range;
  item.insertText = suggestion.insertText ?? suggestion.label;
  item.detail = suggestion.detail ?? "STRX Animation";
  item.documentation = new vscode.MarkdownString(
    suggestion.documentation ?? `\`${suggestion.label}\` animation token`,
  );

  item.sortText = `0000_${index.toString().padStart(4, "0")}`;
  item.filterText = suggestion.label;

  if (suggestion.label.endsWith(":")) {
    item.command = {
      command: "editor.action.triggerSuggest",
      title: "Trigger STRX utility suggestions",
    };
  }

  return item;
}

export function activate(extensionContext: vscode.ExtensionContext) {
  const selector: vscode.DocumentSelector = [
    { language: "javascriptreact", scheme: "file" },
    { language: "typescriptreact", scheme: "file" },
    { language: "javascript", scheme: "file" },
    { language: "typescript", scheme: "file" },
  ];

  const provider = vscode.languages.registerCompletionItemProvider(
    selector,
    {
      provideCompletionItems(document, position) {
        const animateContext = getAnimateContext(document, position);

        if (!animateContext) {
          return undefined;
        }

        const suggestions = getSuggestions(animateContext);

        const items = suggestions.map((suggestion, index) =>
          createCompletionItem(suggestion, index, animateContext.replaceRange),
        );

        return new vscode.CompletionList(items, false);
      },
    },
    '"',
    "'",
    "`",
    " ",
    ":",
    "-",
  );

  extensionContext.subscriptions.push(provider);
}

export function deactivate() {}
