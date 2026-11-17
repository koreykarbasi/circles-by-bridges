import fs from "fs";
import path from "path";
import ts from "typescript";
import vm from "vm";

// Evaluate only the real copy templates, without loading the server or sending pushes.
const source = fs.readFileSync(path.join(__dirname, "../server/push-notifications.ts"), "utf8");
const ast = ts.createSourceFile("push-notifications.ts", source, ts.ScriptTarget.Latest, true);
let templateExpression = "";
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "nudgeTemplates") {
    templateExpression = node.initializer!.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
if (!templateExpression) throw new Error("Suggestion notification templates were not found");
const compiled = ts.transpileModule(`const templates = ${templateExpression}; templates;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const templates = vm.runInNewContext(compiled) as {
  title: (name: string) => string;
  body: (name: string) => string;
}[];

describe("Daily suggestion notification titles", () => {
  test.each(["Alex", "Mary Jane", "José", "A longer contact name"])(
    "every rotating variant uses the short title and preserves the name: %s",
    (name) => {
      expect(templates).toHaveLength(4);
      for (const template of templates) {
        expect(template.title(name)).toBe(`Reach out to ${name}`);
      }
    },
  );

  test("keeps all four existing message bodies unchanged", () => {
    expect(templates.map((template) => template.body("Alex"))).toEqual([
      "Open the app to see what to say.",
      "It's been a while since you connected with Alex — open Bridges for a suggestion.",
      "Thinking of Alex? Open Bridges for a quick way to reach out.",
      "Open Bridges for a suggestion on what to say.",
    ]);
  });

  test("does not retain the old longer title elsewhere in the push sender", () => {
    expect(source).not.toMatch(/time to reach out to/i);
    expect(source).toContain("template.title(bestContact.name)");
  });
});
