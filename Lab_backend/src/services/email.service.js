const {
  EMAIL_PROVIDER,
  EMAIL_FROM,
  RESEND_API_KEY,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_SECURE,
  emailConfigured
} = require('../config/email.config');

let nodemailer = null;
try {
  // Optional dependency until the backend install step is run.
  nodemailer = require('nodemailer');
} catch {
  nodemailer = null;
}

const sendWithResend = async ({ to, subject, html }) => {
  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        subject,
        html
      })
    });
  } catch (error) {
    const code = error?.cause?.code || error?.code;
    const suffix = code ? ` (${code})` : '';
    throw new Error(`Network error contacting Resend API${suffix}: ${error?.message || 'fetch failed'}`);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      `Email provider request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
};

const createGmailTransport = () => {
  if (!nodemailer) {
    throw new Error('nodemailer is not installed yet. Run npm install in Lab_backend first.');
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE || SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
};

const sendWithGmail = async ({ to, subject, html }) => {
  const transport = createGmailTransport();
  const info = await transport.sendMail({
    from: EMAIL_FROM,
    to,
    subject,
    html
  });

  return {
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
    response: info.response
  };
};

const sendEmailByProvider = async ({ to, subject, html }) => {
  if (EMAIL_PROVIDER === 'resend') {
    const payload = await sendWithResend({ to, subject, html });
    return {
      delivered: true,
      skipped: false,
      provider: 'resend',
      providerResponse: payload
    };
  }

  if (EMAIL_PROVIDER === 'gmail') {
    const payload = await sendWithGmail({ to, subject, html });
    return {
      delivered: true,
      skipped: false,
      provider: 'gmail',
      providerResponse: payload
    };
  }

  return {
    delivered: false,
    skipped: true,
    reason: `Unsupported email provider: ${EMAIL_PROVIDER}`
  };
};

const sendInviteEmail = async ({ to, fullName, labName, role, inviteUrl, invitedByName }) => {
  if (!emailConfigured) {
    return {
      delivered: false,
      skipped: true,
      reason: 'Email sending is not configured'
    };
  }

  const subject = `You're invited to join ${labName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <h2 style="margin-bottom: 8px;">You're invited to join ${labName}</h2>
      <p>Hello ${fullName},</p>
      <p>${invitedByName} invited you to join <strong>${labName}</strong> as a <strong>${role}</strong>.</p>
      <p>
        <a href="${inviteUrl}" style="display: inline-block; padding: 10px 16px; background: #166534; color: white; text-decoration: none; border-radius: 6px;">
          Accept Invite
        </a>
      </p>
      <p>If the button does not work, use this link:</p>
      <p><a href="${inviteUrl}">${inviteUrl}</a></p>
    </div>
  `;

  return sendEmailByProvider({ to, subject, html });
};

const sendPasswordResetEmail = async ({ to, fullName, resetUrl }) => {
  if (!emailConfigured) {
    return {
      delivered: false,
      skipped: true,
      reason: 'Email sending is not configured'
    };
  }

  const subject = 'Reset your Mother Roots password';
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <h2 style="margin-bottom: 8px;">Reset your password</h2>
      <p>Hello ${fullName || 'there'},</p>
      <p>We received a request to reset your Mother Roots password.</p>
      <p>
        <a href="${resetUrl}" style="display: inline-block; padding: 10px 16px; background: #166534; color: white; text-decoration: none; border-radius: 6px;">
          Reset Password
        </a>
      </p>
      <p>If the button does not work, use this link:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>If you did not request this, you can safely ignore this email.</p>
    </div>
  `;

  return sendEmailByProvider({ to, subject, html });
};

const sendTestEmail = async ({ to }) => {
  if (!emailConfigured) {
    return {
      delivered: false,
      skipped: true,
      reason: 'Email sending is not configured'
    };
  }

  const subject = 'Mother Roots test email';
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <h2 style="margin-bottom: 8px;">Email connection successful</h2>
      <p>This is a test email from Mother Roots.</p>
      <p>If you received this message, your email configuration is working.</p>
    </div>
  `;

  return sendEmailByProvider({ to, subject, html });
};

module.exports = {
  sendInviteEmail,
  sendPasswordResetEmail,
  sendTestEmail
};
