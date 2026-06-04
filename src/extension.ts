import * as vscode from "vscode";

const BASE_TOKENS = [
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

  "layout-linear",
  "layout-spring",
  "layout-fade",
  "layout-spring-stiff",
  "layout-spring-bouncy",

  "transition",
  "transition-all",
  "transition-colors",
  "transition-opacity",
  "transition-transform",
  "transition-spacing",
  "transition-layout",

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

  "from:",
  "to:",
  "exit:",
] as const;

const UTILITY_TOKENS = [
  "opacity-",
  "translate-x-",
  "-translate-x-",
  "translate-y-",
  "-translate-y-",
  "scale-",
  "scale-x-",
  "scale-y-",
  "rotate-",
  "-rotate-",
  "w-",
  "h-",
] as const;

const MODIFIER_PREFIXES = ["from:", "to:", "exit:"] as const;

type AnimateContext = {
  value: string;
  lastToken: string;
  replaceRange: vscode.Range;
  modifierPrefix?: "from:" | "to:" | "exit:";
};

function getAnimateContext(
  document: vscode.TextDocument,
  position: vscode.Position,
): AnimateContext | undefined {
  const line = document.lineAt(position.line).text;
  const linePrefix = line.slice(0, position.character);

  /**
   * 지원 형태:
   * <View animate="fade-in f" />
   * <View animate='fade-in f' />
   * <View animate={`fade-in f`} />
   * <View animate={"fade-in f"} />
   *
   * 현재 커서 기준으로 아직 닫히지 않은 animate 문자열 내부인지 확인한다.
   */
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

function createCompletionItem(
  candidate: string,
  index: number,
  range: vscode.Range,
  kind: vscode.CompletionItemKind,
): vscode.CompletionItem {
  const item = new vscode.CompletionItem(candidate, kind);

  item.insertText = candidate;
  item.range = range;

  item.detail = "Codex Animation";
  item.documentation = new vscode.MarkdownString(
    `\`${candidate}\` animation token`,
  );

  /**
   * sortText는 "동일하게 잘 매칭되는 후보들 사이의 초기 정렬"에 가깝다.
   * 다른 provider를 제거하는 용도가 아니므로 과한 null character hack은 피한다.
   */
  item.sortText = `0000_${index.toString().padStart(4, "0")}`;

  /**
   * range 전체와 filterText가 같이 동작한다.
   * 예: 사용자가 from:op 까지 입력했으면 filterText from:opacity- 와 매칭된다.
   */
  item.filterText = candidate;

  /**
   * from:, to:, exit: 선택 직후 utility 목록을 바로 다시 열기.
   */
  if (candidate.endsWith(":")) {
    item.command = {
      command: "editor.action.triggerSuggest",
      title: "Trigger Codex Animation utility suggestions",
    };
  }

  return item;
}

function getCandidates(context: AnimateContext): string[] {
  const { modifierPrefix } = context;

  if (modifierPrefix) {
    return UTILITY_TOKENS.map((token) => `${modifierPrefix}${token}`);
  }

  return [...BASE_TOKENS];
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

        const candidates = getCandidates(animateContext);

        const items = candidates.map((candidate, index) => {
          const isUtility = Boolean(animateContext.modifierPrefix);

          return createCompletionItem(
            candidate,
            index,
            animateContext.replaceRange,
            isUtility
              ? vscode.CompletionItemKind.Property
              : vscode.CompletionItemKind.Keyword,
          );
        });

        return new vscode.CompletionList(items, false);
      },
    },

    /**
     * 중요:
     * 알파벳 a-z를 triggerCharacters에 넣지 않는다.
     * 문자열 시작, 공백, modifier 구분자 정도만 트리거한다.
     */
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
