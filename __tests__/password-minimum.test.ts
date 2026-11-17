import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import crypto from "node:crypto";

// Execute the actual route callbacks with mocked dependencies, without starting
// the server, connecting to a database, or sending any password-reset emails.
const source = fs.readFileSync(path.join(__dirname, "../server/routes.ts"), "utf8");
const ast = ts.createSourceFile("routes.ts", source, ts.ScriptTarget.Latest, true);

function routeHandler(route: string, dependencies: Record<string, unknown>) {
  let handler: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(ast) === "app"
      && node.arguments[0] && ts.isStringLiteral(node.arguments[0])
      && node.arguments[0].text === route) {
      handler = node.arguments[node.arguments.length - 1];
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!handler) throw new Error(`Missing route ${route}`);
  const js = ts.transpileModule(`(${handler.getText(ast)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return vm.runInNewContext(js, dependencies);
}

function setup(route: string) {
  const user = { id: "test-user", email: "user@example.com", password: "stored-hash" };
  const storage = {
    getUserByEmail: jest.fn().mockResolvedValue(route.endsWith("register") ? undefined : user),
    createUser: jest.fn().mockResolvedValue(user),
    getUser: jest.fn().mockResolvedValue(user),
    updateUser: jest.fn().mockResolvedValue(user),
    getPasswordResetTokenByHash: jest.fn().mockResolvedValue({
      id: "reset-token", userId: user.id, usedAt: null, expiresAt: new Date(Date.now() + 60_000),
    }),
    markPasswordResetTokenUsed: jest.fn().mockResolvedValue(undefined),
  };
  const bcrypt = {
    hash: jest.fn().mockResolvedValue("new-hash"),
    compare: jest.fn().mockResolvedValue(true),
  };
  const pool = { query: jest.fn().mockResolvedValue({}) };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const req = {
    body: {} as Record<string, unknown>,
    session: {
      id: "session-id", userId: user.id,
      regenerate: (callback: () => void) => callback(),
      save: (callback: () => void) => callback(),
    },
  };
  const handler = routeHandler(route, {
    storage, bcrypt, pool, crypto, console, DISPOSABLE_DOMAINS: new Set(),
    bad: (response: typeof res, message: string) => response.status(400).json({ message }),
  });
  return { storage, bcrypt, pool, req, res, run: () => handler(req, res) };
}

describe.each(["register", "reset-password", "change-password"])("%s password minimum", (endpoint) => {
  test.each(["abc123", "abc1234", 12345678, { length: 8 }, ["abcdefgh"]])(
    "rejects a short or non-string new password: %p", async (password) => {
      const h = setup(`/api/auth/${endpoint}`);
      h.req.body = {
        email: "user@example.com", password, newPassword: password,
        token: "test-token", currentPassword: "abc123",
      };
      await h.run();
      expect(h.res.status).toHaveBeenCalledWith(400);
      expect(h.res.json).toHaveBeenCalledWith({
        message: `${endpoint === "change-password" ? "New password" : "Password"} must be at least 8 characters`,
      });
      expect(h.bcrypt.hash).not.toHaveBeenCalled();
      expect(h.storage.createUser).not.toHaveBeenCalled();
      expect(h.storage.updateUser).not.toHaveBeenCalled();
      expect(h.storage.markPasswordResetTokenUsed).not.toHaveBeenCalled();
    },
  );

  test.each(["abc12345", "a longer passphrase"])("accepts a valid password: %s", async (password) => {
    const h = setup(`/api/auth/${endpoint}`);
    h.req.body = {
      email: "user@example.com", password, newPassword: password,
      token: "test-token", currentPassword: "abc123",
    };
    await h.run();
    expect(h.res.status).not.toHaveBeenCalledWith(400);
    expect(h.res.status).not.toHaveBeenCalledWith(500);
    expect(h.bcrypt.hash).toHaveBeenCalledWith(password, 10);
    if (endpoint === "register") {
      expect(h.storage.createUser).toHaveBeenCalled();
      expect(h.res.status).toHaveBeenCalledWith(201);
    } else {
      expect(h.storage.updateUser).toHaveBeenCalled();
      expect(h.res.json).toHaveBeenCalledWith({ message: "Password updated successfully." });
    }
  });
});

test("login still accepts existing six-character passwords", async () => {
  const h = setup("/api/auth/login");
  h.req.body = { email: "user@example.com", password: "abc123" };
  await h.run();
  expect(h.bcrypt.compare).toHaveBeenCalledWith("abc123", "stored-hash");
  expect(h.res.status).not.toHaveBeenCalled();
  expect(h.res.json).toHaveBeenCalledWith(expect.objectContaining({ id: "test-user" }));
});
