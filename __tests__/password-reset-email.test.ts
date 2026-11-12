// Mock the entire provider module: these tests must never send network emails.
jest.mock("resend", () => ({
  Resend: jest.fn(),
}));

describe("sendPasswordResetEmail", () => {
  const recipient = "reset-recipient@example.com";
  const resetUrl = `https://buildmybridges.com/reset-password?token=${"a1".repeat(32)}`;
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
