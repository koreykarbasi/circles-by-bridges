// Mock the entire provider module: these tests must never send network emails.
jest.mock("resend", () => ({
  Resend: jest.fn(),
}));

describe("sendPasswordResetEmail", () => {
  const recipient = "reset-recipient@example.com";
  const resetUrl = `https://circles-by-bridges.replit.app/reset-password?token=${"a1".repeat(32)}`;
  let sendPasswordResetEmail: typeof import("../server/email").sendPasswordResetEmail;
  let mockSend: jest.Mock;
  let mockResend: jest.Mock;

  beforeEach(() => {
    // Reset the module-scoped lazy client so no test can reuse another's client.
    jest.resetModules();
    // Replace, rather than read, the environment: never use a real credential.
    jest.replaceProperty(process, "env", {
      NODE_ENV: "production",
      RESEND_API_KEY: "re_test_not_a_real_key",
    });
    mockSend = jest.fn().mockResolvedValue({
      data: { id: "mock-email-id" },
      error: null,
    });
    mockResend = require("resend").Resend;
    mockResend.mockImplementation(() => ({ emails: { send: mockSend } }));
    ({ sendPasswordResetEmail } = require("../server/email"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("uses the verified-domain sender and preserves recipient, subject, and reset link in production", async () => {
    await expect(sendPasswordResetEmail(recipient, resetUrl)).resolves.toBeUndefined();

    expect(mockResend).toHaveBeenCalledTimes(1);
    expect(mockResend).toHaveBeenCalledWith("re_test_not_a_real_key");
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      from: "Bridges <noreply@buildmybridges.com>",
      to: recipient,
      subject: "Reset your Bridges password",
      html: expect.any(String),
    });
    const { from, html } = mockSend.mock.calls[0][0];
    expect(from).not.toContain("onboarding@resend.dev");
    expect(html).toContain(`href="${resetUrl}"`);
    expect(html).toContain(`Or copy this link: ${resetUrl}`);
    expect(html).toContain(">15 minutes</strong>");
  });

  test("rejects with the provider's error message instead of reporting success", async () => {
    mockSend.mockResolvedValueOnce({
      data: null,
      error: { name: "validation_error", message: "The sender domain is not verified" },
    });

    await expect(sendPasswordResetEmail(recipient, resetUrl)).rejects.toThrow(
      "Failed to send password reset email: The sender domain is not verified",
    );
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test("propagates a rejected transport request", async () => {
    const transportError = new Error("Mock transport unavailable");
    mockSend.mockRejectedValueOnce(transportError);

    await expect(sendPasswordResetEmail(recipient, resetUrl)).rejects.toBe(transportError);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test("fails explicitly without a configured key and never calls the transport", async () => {
    delete process.env.RESEND_API_KEY;

    await expect(sendPasswordResetEmail(recipient, resetUrl)).rejects.toThrow(
      "RESEND_API_KEY is not configured",
    );
    expect(mockResend).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("password-reset email link destination", () => {
  // Execute the actual route's link-building statements, without loading the
  // server, touching the database, or sending any network email.
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const vm = require("node:vm") as typeof import("node:vm");
  const ts = require("typescript") as typeof import("typescript");
  const source = fs.readFileSync(path.join(__dirname, "../server/routes.ts"), "utf8");
  const linkStatements = source.match(
    /const baseUrl = process\.env\.APP_BASE_URL[\s\S]*?await sendPasswordResetEmail\(user\.email, resetUrl\.toString\(\)\);/,
  )?.[0];

  async function buildLink(env: Record<string, string>, token = "a1".repeat(32)) {
    expect(linkStatements).toBeDefined();
    const send = jest.fn().mockResolvedValue(undefined);
    const compiled = ts.transpileModule(
      `(async () => { ${linkStatements} })()`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
    ).outputText;
    await vm.runInNewContext(compiled, {
      URL,
      process: { env },
      rawToken: token,
      user: { email: "reset-recipient@example.com" },
      sendPasswordResetEmail: send,
    });
    expect(send).toHaveBeenCalledTimes(1);
    return new URL(send.mock.calls[0][1]);
  }

  test("defaults to the published reset page, not the email-sending domain", async () => {
    const link = await buildLink({});
    expect(link.origin).toBe("https://circles-by-bridges.replit.app");
    expect(link.pathname).toBe("/reset-password");
    expect(link.searchParams.get("token")).toBe("a1".repeat(32));
  });

  test("never uses the Expo packager domain as the fallback email destination", async () => {
    const link = await buildLink({ EXPO_PUBLIC_DOMAIN: "private-preview.example.invalid:5000" });
    expect(link.origin).toBe("https://circles-by-bridges.replit.app");
  });

  test.each(["https://configured.example.com", "https://configured.example.com/"])(
    "honors an explicitly configured web origin without double slashes: %s",
    async (APP_BASE_URL) => {
      const link = await buildLink({ APP_BASE_URL });
      expect(link.origin).toBe("https://configured.example.com");
      expect(link.pathname).toBe("/reset-password");
    },
  );

  test("preserves the token safely as a single query parameter", async () => {
    const token = "mock+token&not=another#fragment";
    const link = await buildLink({}, token);
    expect(link.searchParams.get("token")).toBe(token);
    expect(Array.from(link.searchParams.keys())).toEqual(["token"]);
    expect(link.hash).toBe("");
  });
});
