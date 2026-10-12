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
  read: () => T | undefined | Promise<T | undefined>,
  timeoutMs = 5000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await read();

    if (value !== undefined) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Timed out");
}

suite("STRX Animation IntelliSense", () => {
  suiteSetup(async () => {
    // Opening a document only schedules activation; activate explicitly so
    // providers are registered before the first request.
    await vscode.extensions
      .getExtension("strx.strx-animation-intellisense")
      ?.activate();
  });

  test("suggests v1 tokens inside animate strings", async () => {
    const source = `<Strx.View animate="fade-in " />`;
    const document = await openTsx(source);
    const position = document.positionAt(source.indexOf('in "') + 3);
    const labels = await waitFor(async () => {
      const list =
        await vscode.commands.executeCommand<vscode.CompletionList>(
          "vscode.executeCompletionItemProvider",
          document.uri,
          position,
        );
      const found = list.items.map((item) =>
        typeof item.label === "string" ? item.label : item.label.label,
      );
      return found.includes("layout-spring") ? found : undefined;
    });

    assert.ok(labels.includes("spring"));
    assert.ok(labels.includes("layout-spring"));
    assert.ok(!labels.includes("slide-up"), "one preset per group");
  });

  test("adds animated previews to completion details and hovers", async () => {
    const source = `<Strx.View animate="fade-in from:translate-y-12 spring" />`;
    const document = await openTsx(source);
    const preview = /!\[Animation preview\]\(data:image\/svg\+xml;base64,/;
    const markdown = (value: vscode.CompletionItem["documentation"]) =>
      typeof value === "string" ? value : (value?.value ?? "");

    const item = await waitFor(async () => {
      const list =
        await vscode.commands.executeCommand<vscode.CompletionList>(
          "vscode.executeCompletionItemProvider",
          document.uri,
          document.positionAt(source.indexOf('"') + 1),
          undefined,
          // Presets come first; resolving the first few covers slide-up.
          10,
        );
      return list.items.find(
        (candidate) =>
          candidate.label === "slide-up" &&
          preview.test(markdown(candidate.documentation)),
      );
    });

    assert.ok(item);

    const hovers = await waitFor(async () => {
      const found = await vscode.commands.executeCommand<vscode.Hover[]>(
        "vscode.executeHoverProvider",
        document.uri,
        document.positionAt(source.indexOf("fade-in") + 2),
      );
      return found.length > 0 ? found : undefined;
    });
    const contents = hovers
      .flatMap((hover) => hover.contents)
      .map((content) => (typeof content === "string" ? content : content.value))
      .join("\n");

    assert.equal(contents.match(/!\[Animation preview\]/g)?.length, 2);
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
