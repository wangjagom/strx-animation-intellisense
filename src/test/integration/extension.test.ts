import * as assert from "assert";
import * as vscode from "vscode";

async function openTsx(content: string): Promise<vscode.TextDocument> {
  const document = await vscode.workspace.openTextDocument({
    language: "typescriptreact",
    content,
  });
  await vscode.window.showTextDocument(document);
  return document;
}

async function waitFor<T>(
  read: () => T | undefined,
  timeoutMs = 5000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = read();

    if (value !== undefined) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Timed out");
}

suite("STRX Animation IntelliSense", () => {
  test("suggests v1 tokens inside animate strings", async () => {
    const source = `<Strx.View animate="fade-in " />`;
    const document = await openTsx(source);
    const position = document.positionAt(source.indexOf('in "') + 3);
    const list = await vscode.commands.executeCommand<vscode.CompletionList>(
      "vscode.executeCompletionItemProvider",
      document.uri,
      position,
    );
    const labels = list.items.map((item) =>
      typeof item.label === "string" ? item.label : item.label.label,
    );

    assert.ok(labels.includes("spring"));
    assert.ok(labels.includes("layout-spring"));
    assert.ok(!labels.includes("slide-up"), "one preset per group");
  });

  test("reports unknown tokens with a quick fix", async () => {
    const document = await openTsx(
      `const t = { playables: [{ target: "a", animate: "fade-inn" }] };`,
    );
    const diagnostics = await waitFor(() => {
      const found = vscode.languages
        .getDiagnostics(document.uri)
        .filter((diagnostic) => diagnostic.source === "strx");
      return found.length > 0 ? found : undefined;
    });

    assert.match(diagnostics[0].message, /did you mean "fade-in"/i);

    const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
      "vscode.executeCodeActionProvider",
      document.uri,
      diagnostics[0].range,
    );

    assert.ok(actions.some((action) => action.title === 'Replace with "fade-in"'));
  });
});
