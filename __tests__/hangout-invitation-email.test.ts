// Mock the provider module completely so these tests cannot send real invitations.
jest.mock("resend", () => ({ Resend: jest.fn() }));

describe("sendHangoutCalendarInvite", () => {
  const recipient = "invited-friend@example.com";
  const icsContent = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nSUMMARY:Café with friends\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
  let sendInvite: typeof import("../server/email").sendHangoutCalendarInvite;
  let mockSend: jest.Mock;
  let mockResend: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    // Replace rather than read the environment; never use actual credentials.
    jest.replaceProperty(process, "env", {
      NODE_ENV: "production",
      RESEND_API_KEY: "re_test_not_a_real_key",
    });
    mockSend = jest.fn().mockResolvedValue({ data: { id: "mock-invite" }, error: null });
    mockResend = require("resend").Resend;
    mockResend.mockImplementation(() => ({ emails: { send: mockSend } }));
    ({ sendHangoutCalendarInvite: sendInvite } = require("../server/email"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("uses the verified sender and preserves the recipient, invitation, and calendar attachment", async () => {
    await expect(sendInvite(recipient, "Alex", "Café with friends", "Friday at 6 PM", "Central Café", icsContent))
      .resolves.toBeUndefined();

    expect(mockResend).toHaveBeenCalledWith("re_test_not_a_real_key");
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      from: "Bridges <noreply@buildmybridges.com>",
      to: recipient,
      subject: "You're invited: Café with friends",
      html: expect.any(String),
      attachments: [{ filename: "invite.ics", content: Buffer.from(icsContent).toString("base64") }],
    });
    const { html, attachments } = mockSend.mock.calls[0][0];
    expect(html).toContain("Hi Alex, you've been invited to:");
    expect(html).toContain("Café with friends");
    expect(html).toContain("Friday at 6 PM");
    expect(html).toContain("Central Café");
    expect(html).toContain("Open the attachment to add it to your calendar.");
    expect(Buffer.from(attachments[0].content, "base64").toString("utf8")).toBe(icsContent);
  });

  test.each([null, ""])("omits the location row when location is %p", async (location) => {
    await sendInvite(recipient, "Alex", "Dinner", "Friday", location, icsContent);
    expect(mockSend.mock.calls[0][0].html).not.toContain(">Where</td>");
  });

  test("preserves HTML escaping and CR/LF removal for user-supplied invitation details", async () => {
    await sendInvite(recipient, "A<&\"'\r\nB", "Dinner <friends>\r\nTonight", "Fri & Sat\r\n6 PM", "Café <north>\r\nPatio", icsContent);
    const { subject, html } = mockSend.mock.calls[0][0];
    expect(subject).toBe("You're invited: Dinner <friends>  Tonight");
    expect(subject).not.toMatch(/[\r\n]/);
    expect(html).toContain("A&lt;&amp;&quot;&#x27;  B");
    expect(html).toContain("Dinner &lt;friends&gt;  Tonight");
    expect(html).toContain("Fri &amp; Sat  6 PM");
    expect(html).toContain("Café &lt;north&gt;  Patio");
  });

  test("rejects provider errors instead of reporting successful delivery", async () => {
    mockSend.mockResolvedValueOnce({ data: null, error: { message: "Sender domain not verified" } });
    await expect(sendInvite(recipient, "Alex", "Dinner", "Friday", null, icsContent))
      .rejects.toThrow("Failed to send calendar invite email: Sender domain not verified");
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test("propagates transport failures", async () => {
    const error = new Error("Mock transport unavailable");
    mockSend.mockRejectedValueOnce(error);
    await expect(sendInvite(recipient, "Alex", "Dinner", "Friday", null, icsContent))
      .rejects.toBe(error);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test("fails explicitly without a key and never calls the provider", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendInvite(recipient, "Alex", "Dinner", "Friday", null, icsContent))
      .rejects.toThrow("RESEND_API_KEY is not configured");
    expect(mockResend).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });
});
