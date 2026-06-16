import { Resend } from "resend";

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const resend = getResend();

  const { error } = await resend.emails.send({
    from: "Bridges <onboarding@resend.dev>",
    to,
    subject: "Reset your Bridges password",
    html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reset your password</title>
</head>
<body style="margin:0;padding:0;background:#0B0718;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#F0ECF8">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0B0718;padding:40px 20px">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="480" style="background:#130F24;border-radius:16px;border:1px solid #2A2148;overflow:hidden;max-width:480px;width:100%">
        <tr>
          <td style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid #2A2148">
            <svg width="32" height="32" viewBox="0 0 100 100" fill="none" style="display:inline-block;vertical-align:middle;margin-right:8px"><path d="M20 70 Q50 20 80 70" stroke="#9B7DFF" stroke-width="6" fill="none"/><path d="M30 70 Q50 30 70 70" stroke="#B9A4FF" stroke-width="4" fill="none"/></svg>
            <span style="font-size:20px;font-weight:700;color:#9B7DFF;vertical-align:middle">Bridges</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 24px">
            <h1 style="margin:0 0 12px;font-size:24px;font-weight:800;color:#F0ECF8">Reset your password</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#9B93B8">
              We received a request to reset your Bridges password. Click the button below to choose a new one.
              This link expires in <strong style="color:#F0ECF8">15 minutes</strong>.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="center" style="padding-bottom:24px">
                  <a href="${resetUrl}" style="display:inline-block;background:#9B7DFF;color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:16px;font-weight:700;letter-spacing:0.2px">
                    Reset Password
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:#5E5580">
              If you did not request a password reset, you can safely ignore this email. Your password will not change.
            </p>
            <p style="margin:0;font-size:12px;color:#3A2A58;word-break:break-all">
              Or copy this link: ${resetUrl}
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #2A2148;text-align:center">
            <p style="margin:0;font-size:12px;color:#3A2A58">
              Bridges &mdash; Stay close to the people who matter most
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`,
  });

  if (error) {
    throw new Error(`Failed to send password reset email: ${error.message}`);
  }
}

export async function sendHangoutCalendarInvite(
  to: string,
  contactName: string,
  hangoutTitle: string,
  timeLabel: string,
  locationLabel: string | null,
  icsContent: string,
): Promise<void> {
  const resend = getResend();

  const locationRow = locationLabel
    ? `<tr><td style="padding:4px 0;font-size:13px;color:#9B93B8">Where</td><td style="padding:4px 0 4px 16px;font-size:14px;font-weight:600;color:#F0ECF8">${locationLabel}</td></tr>`
    : "";

  const { error } = await resend.emails.send({
    from: "Bridges <onboarding@resend.dev>",
    to,
    subject: `You're invited: ${hangoutTitle}`,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>You're invited</title>
</head>
<body style="margin:0;padding:0;background:#0B0718;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#F0ECF8">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0B0718;padding:40px 20px">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="480" style="background:#130F24;border-radius:16px;border:1px solid #2A2148;overflow:hidden;max-width:480px;width:100%">
        <tr>
          <td style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid #2A2148">
            <svg width="32" height="32" viewBox="0 0 100 100" fill="none" style="display:inline-block;vertical-align:middle;margin-right:8px"><path d="M20 70 Q50 20 80 70" stroke="#9B7DFF" stroke-width="6" fill="none"/><path d="M30 70 Q50 30 70 70" stroke="#B9A4FF" stroke-width="4" fill="none"/></svg>
            <span style="font-size:20px;font-weight:700;color:#9B7DFF;vertical-align:middle">Bridges</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 8px">
            <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#F0ECF8">You're invited!</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#9B93B8">
              Hi ${contactName}, you've been invited to:
            </p>
            <div style="background:#1E1640;border-radius:12px;border:1px solid #2A2148;padding:20px 20px 16px;margin-bottom:24px">
              <p style="margin:0 0 14px;font-size:20px;font-weight:800;color:#F0ECF8">${hangoutTitle}</p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:4px 0;font-size:13px;color:#9B93B8">When</td>
                  <td style="padding:4px 0 4px 16px;font-size:14px;font-weight:600;color:#F0ECF8">${timeLabel}</td>
                </tr>
                ${locationRow}
              </table>
            </div>
            <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#9B93B8">
              The calendar invite is attached to this email. Open the attachment to add it to your calendar.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #2A2148;text-align:center">
            <p style="margin:0;font-size:12px;color:#3A2A58">
              Bridges &mdash; Stay close to the people who matter most
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`,
    attachments: [
      {
        filename: "invite.ics",
        content: Buffer.from(icsContent).toString("base64"),
      },
    ],
  });

  if (error) {
    throw new Error(`Failed to send calendar invite email: ${error.message}`);
  }
}
