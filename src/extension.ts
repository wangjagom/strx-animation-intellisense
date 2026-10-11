import * as path from "path";
import * as vscode from "vscode";

import { computeCompletions, type CompletionData } from "./completion";
import { findDefinedPresets } from "./customPresets";
import {
  findAnimateSegments,
  segmentAt,
  type AnimateSegment,
  type SourceLanguage,
} from "./documentScanner";
import {
  analyze,
  analyzePresetName,
  type GrammarContext,
  type TokenIssue,
} from "./grammar";
import { computeHover } from "./hover";
import { loadMetadata, type LoadedMetadata } from "./metadata";

const LANGUAGES: SourceLanguage[] = [
  "typescriptreact",
  "javascriptreact",
  "typescript",
  "javascript",
];
const SELECTOR: vscode.DocumentSelector = LANGUAGES.map((language) => ({
  language,
}));
const SOURCE_GLOB = "**/*.{js,jsx,ts,tsx}";
const EXCLUDE_GLOB = "**/{node_modules,lib,dist,build,out}/**";
const MAX_SCANNED_FILES = 5000;
const DIAGNOSTIC_DELAY_MS = 250;

/** Matches an animate string still being typed when the file does not parse. */
const FALLBACK_PATTERN =
  /\banimate\s*(?:=\s*\{?|:)\s*[^"'`]*?(["'`])([^"'`]*)$/;

const CATEGORY_ORDER: Record<CompletionData["category"], number> = {
  preset: 0,
  keyframePrefix: 1,
  utility: 1,
  layout: 2,
  transition: 3,
  easing: 4,
  timing: 5,
  legacy: 9,
};

const CATEGORY_KIND: Record<
  CompletionData["category"],
  vscode.CompletionItemKind
> = {
  preset: vscode.CompletionItemKind.Constant,
  keyframePrefix: vscode.CompletionItemKind.Keyword,
  utility: vscode.CompletionItemKind.Property,
  layout: vscode.CompletionItemKind.EnumMember,
  transition: vscode.CompletionItemKind.EnumMember,
  easing: vscode.CompletionItemKind.Value,
  timing: vscode.CompletionItemKind.Value,
  legacy: vscode.CompletionItemKind.Value,
};

interface LocatedIssue {
  range: vscode.Range;
  issue: TokenIssue;
}

interface LocatedValue {
  value: string;
  /** Document offset of the value's first character. */
  start: number;
  /** Cursor offset within the value. */
  offset: number;
  kind: AnimateSegment["kind"];
}

class StrxLanguageService {
  private readonly metadataByFolder = new Map<string, LoadedMetadata>();
  private readonly customPresetsByFile = new Map<string, string[]>();
  private readonly segmentCache = new Map<
    string,
    { version: number; segments: AnimateSegment[] | undefined }
  >();

  context(document: vscode.TextDocument): GrammarContext {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    const key = folder?.uri.toString() ?? "";
    let loaded = this.metadataByFolder.get(key);

    if (!loaded) {
      loaded = loadMetadata(folder?.uri.fsPath);
      this.metadataByFolder.set(key, loaded);
    }

    return {
      metadata: loaded.metadata,
      customPresets: new Set([...this.customPresetsByFile.values()].flat()),
    };
  }

  resetMetadata(): void {
    this.metadataByFolder.clear();
  }

  segments(document: vscode.TextDocument): AnimateSegment[] | undefined {
    const key = document.uri.toString();
    const cached = this.segmentCache.get(key);

    if (cached && cached.version === document.version) {
      return cached.segments;
    }

    const segments = findAnimateSegments(
      document.getText(),
      document.languageId as SourceLanguage,
    );
    this.segmentCache.set(key, { version: document.version, segments });

    return segments;
  }

  forget(document: vscode.TextDocument): void {
    this.segmentCache.delete(document.uri.toString());
  }

  updateCustomPresets(uri: vscode.Uri, text: string | undefined): void {
    const names = text === undefined ? [] : findDefinedPresets(text);

    if (names.length > 0) {
      this.customPresetsByFile.set(uri.toString(), names);
    } else {
      this.customPresetsByFile.delete(uri.toString());
    }
  }

  /** Locates the animate string at `position`, if any. */
  valueAt(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): LocatedValue | undefined {
    const offset = document.offsetAt(position);
    const segment = segmentAt(this.segments(document) ?? [], offset);

    if (segment) {
      return {
        value: segment.value,
        start: segment.start,
        offset: offset - segment.start,
        kind: segment.kind,
      };
    }

    // The file may not parse while a string is being typed.
    const linePrefix = document
      .lineAt(position.line)
      .text.slice(0, position.character);
    const match = FALLBACK_PATTERN.exec(linePrefix);

    if (!match) {
      return undefined;
    }

    const value = match[2];

    return {
      value,
      start: offset - value.length,
      offset: value.length,
      kind: "tokens",
    };
  }

  issues(document: vscode.TextDocument): LocatedIssue[] {
    const segments = this.segments(document);

    if (!segments) {
      return [];
    }

    const context = this.context(document);
    const issues: LocatedIssue[] = [];
    const range = (start: number, end: number) =>
      new vscode.Range(document.positionAt(start), document.positionAt(end));

    for (const segment of segments) {
      if (segment.kind === "presetName") {
        const issue = analyzePresetName(segment.value, context);

        if (issue) {
          issues.push({ range: range(segment.start, segment.end), issue });
        }

        continue;
      }

      for (const token of analyze(segment.value, context)) {
        // Tokens next to a `${}` expression may continue outside this string.
        const touchesExpression =
          (segment.openStart && token.start === 0) ||
          (segment.openEnd && token.end === segment.value.length);

        if (token.issue && !touchesExpression) {
          issues.push({
            range: range(
              segment.start + token.start,
              segment.start + token.end,
            ),
            issue: token.issue,
          });
        }
      }
    }

    return issues;
  }
}

function toCompletionItem(
  data: CompletionData,
  index: number,
  range: vscode.Range,
): vscode.CompletionItem {
  const item = new vscode.CompletionItem(
    data.label,
    CATEGORY_KIND[data.category],
  );

  item.range = range;
  item.insertText = data.snippet
    ? new vscode.SnippetString(data.insertText)
    : data.insertText;
  item.filterText = data.insertText.replace(/\$\{1:([^}]*)\}/, "$1");
  item.detail = data.detail;
  item.documentation = new vscode.MarkdownString(data.documentation);
  item.sortText = `${CATEGORY_ORDER[data.category]}_${index
    .toString()
    .padStart(4, "0")}`;

  if (data.deprecated) {
    item.tags = [vscode.CompletionItemTag.Deprecated];
  }

  if (data.retrigger) {
    item.command = {
      command: "editor.action.triggerSuggest",
      title: "Suggest STRX utilities",
    };
  }

  return item;
}

function quickFixes(
  document: vscode.TextDocument,
  range: vscode.Range,
  issue: TokenIssue,
): vscode.CodeAction[] {
  const actions: vscode.CodeAction[] = [];

  if (issue.suggestion) {
    const action = new vscode.CodeAction(
      `Replace with "${issue.suggestion}"`,
      vscode.CodeActionKind.QuickFix,
    );
    action.edit = new vscode.WorkspaceEdit();
    action.edit.replace(document.uri, range, issue.suggestion);
    action.isPreferred = true;
    actions.push(action);
  }

  if (issue.needsComma) {
    const action = new vscode.CodeAction(
      "Start a new group with a comma",
      vscode.CodeActionKind.QuickFix,
    );
    const tokenStart = document.offsetAt(range.start);
    const whitespace =
      /\s*$/.exec(document.getText().slice(0, tokenStart))?.[0].length ?? 0;

    action.edit = new vscode.WorkspaceEdit();
    action.edit.replace(
      document.uri,
      new vscode.Range(document.positionAt(tokenStart - whitespace), range.start),
      ", ",
    );
    action.isPreferred = !issue.suggestion;
    actions.push(action);
  }

  return actions;
}

function diagnosticsEnabled(): boolean {
  return vscode.workspace
    .getConfiguration("strxAnimation")
    .get<boolean>("diagnostics.enable", true);
}

export function activate(extensionContext: vscode.ExtensionContext): void {
  const service = new StrxLanguageService();
  const diagnostics = vscode.languages.createDiagnosticCollection("strx");
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  const isSource = (document: vscode.TextDocument) =>
    (LANGUAGES as string[]).includes(document.languageId);

  const refresh = (document: vscode.TextDocument) => {
    if (!isSource(document)) {
      return;
    }

    if (!diagnosticsEnabled()) {
      diagnostics.delete(document.uri);
      return;
    }

    diagnostics.set(
      document.uri,
      service.issues(document).map(({ range, issue }) => {
        const diagnostic = new vscode.Diagnostic(
          range,
          issue.suggestion
            ? `${issue.message} Did you mean "${issue.suggestion}"?`
            : issue.message,
          vscode.DiagnosticSeverity.Warning,
        );

        diagnostic.source = "strx";
        return diagnostic;
      }),
    );
  };

  const scheduleRefresh = (document: vscode.TextDocument) => {
    const key = document.uri.toString();
    clearTimeout(pending.get(key));
    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        refresh(document);
      }, DIAGNOSTIC_DELAY_MS),
    );
  };

  const refreshAll = () => vscode.workspace.textDocuments.forEach(refresh);

  const rescanFile = async (uri: vscode.Uri) => {
    if (uri.fsPath.split(path.sep).includes("node_modules")) {
      return;
    }

    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      service.updateCustomPresets(uri, Buffer.from(bytes).toString("utf8"));
    } catch {
      service.updateCustomPresets(uri, undefined);
    }
  };

  const scanWorkspacePresets = async () => {
    const files = await vscode.workspace.findFiles(
      SOURCE_GLOB,
      EXCLUDE_GLOB,
      MAX_SCANNED_FILES,
    );

    await Promise.all(files.map(rescanFile));
    refreshAll();
  };

  const reloadMetadata = () => {
    service.resetMetadata();
    refreshAll();
  };

  const sourceWatcher = vscode.workspace.createFileSystemWatcher(SOURCE_GLOB);
  const packageWatcher = vscode.workspace.createFileSystemWatcher(
    "**/node_modules/react-native-strx/package.json",
  );

  extensionContext.subscriptions.push(
    diagnostics,
    sourceWatcher,
    packageWatcher,
    sourceWatcher.onDidChange(rescanFile),
    sourceWatcher.onDidCreate(rescanFile),
    sourceWatcher.onDidDelete((uri) =>
      service.updateCustomPresets(uri, undefined),
    ),
    packageWatcher.onDidChange(reloadMetadata),
    packageWatcher.onDidCreate(reloadMetadata),
    packageWatcher.onDidDelete(reloadMetadata),
    vscode.commands.registerCommand(
      "strxAnimation.reloadTokens",
      reloadMetadata,
    ),

    vscode.languages.registerCompletionItemProvider(
      SELECTOR,
      {
        provideCompletionItems(document, position) {
          const located = service.valueAt(document, position);

          if (!located || located.kind !== "tokens") {
            return undefined;
          }

          const result = computeCompletions(
            located.value,
            located.offset,
            service.context(document),
          );
          const range = new vscode.Range(
            document.positionAt(located.start + result.replaceStart),
            document.positionAt(located.start + result.replaceEnd),
          );

          return new vscode.CompletionList(
            result.items.map((item, index) =>
              toCompletionItem(item, index, range),
            ),
            false,
          );
        },
      },
      '"',
      "'",
      "`",
      " ",
      ",",
      ":",
    ),

    vscode.languages.registerHoverProvider(SELECTOR, {
      provideHover(document, position) {
        const located = service.valueAt(document, position);

        if (!located || located.kind !== "tokens") {
          return undefined;
        }

        const hover = computeHover(
          located.value,
          located.offset,
          service.context(document),
        );

        return hover
          ? new vscode.Hover(
              new vscode.MarkdownString(hover.markdown),
              new vscode.Range(
                document.positionAt(located.start + hover.start),
                document.positionAt(located.start + hover.end),
              ),
            )
          : undefined;
      },
    }),

    vscode.languages.registerCodeActionsProvider(
      SELECTOR,
      {
        provideCodeActions(document, range) {
          return service
            .issues(document)
            .filter((located) => located.range.intersection(range))
            .flatMap((located) =>
              quickFixes(document, located.range, located.issue),
            );
        },
      },
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    ),

    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (isSource(event.document)) {
        service.updateCustomPresets(
          event.document.uri,
          event.document.getText(),
        );
        scheduleRefresh(event.document);
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      service.forget(document);
      diagnostics.delete(document.uri);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("strxAnimation")) {
        refreshAll();
      }
    }),
    {
      dispose: () => pending.forEach((timer) => clearTimeout(timer)),
    },
  );

  refreshAll();
  void scanWorkspacePresets();
}

export function deactivate(): void {}
