interface SendPasswordResetEmailArgs {
  email: string;
  name: string;
  resetUrl: string;
}

function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();

  if (!apiKey || !from) {
    throw new Error("Resend password reset email is not configured");
  }

  return { apiKey, from };
}

export async function sendPasswordResetEmail({
  email,
  name,
  resetUrl,
}: SendPasswordResetEmailArgs) {
  const { apiKey, from } = getResendConfig();
  const safeName = name.trim() || "player";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Reset your Anti-Selek password",
      text: `Hi ${safeName},\n\nUse this link to reset your Anti-Selek password:\n${resetUrl}\n\nThis link will expire in 1 hour. If you didn't request this, you can ignore this email.`,
      html: `
        <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">
          <p>Hi ${safeName},</p>
          <p>Use the button below to reset your Anti-Selek password.</p>
          <p>
            <a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">
              Reset password
            </a>
          </p>
          <p>If the button does not work, use this link instead:</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>This link will expire in 1 hour. If you didn't request this, you can ignore this email.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Resend email failed with status ${response.status}: ${await response.text()}`
    );
  }
}
