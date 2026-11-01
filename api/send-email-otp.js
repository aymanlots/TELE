import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { to, otp, type, storeName, userName, customGmailUser, customGmailAppPassword } =
    req.body || {};

  if (!to || !otp) {
    return res.status(400).json({
      success: false,
      error: 'البريد الإلكتروني (Gmail) ورمز التحقق مطلوبان.',
    });
  }

  const gmailUser = (customGmailUser || process.env.GMAIL_USER || '').trim();
  const gmailPass = (customGmailAppPassword || process.env.GMAIL_APP_PASSWORD || '').replace(
    /\s+/g,
    ''
  );

  if (!gmailUser || !gmailPass) {
    return res.status(400).json({
      success: false,
      delivered: false,
      code: 'GMAIL_CREDENTIALS_MISSING',
      error: 'GMAIL_CREDENTIALS_MISSING',
    });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });

    const isReset = type === 'password_reset';
    const shopTitle = storeName || 'المحل الذهبي';
    const subject = isReset
      ? `🔐 كود استرجاع كلمة المرور (${otp}) - ${shopTitle}`
      : `✅ كود تأكيد حساب Gmail (${otp}) - ${shopTitle}`;

    const htmlBody = `
      <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0f0f0f; color: #ffffff; border: 1px solid #f59e0b; border-radius: 16px; padding: 28px; text-align: right;">
        <h2 style="color: #f59e0b; margin-top: 0;">${shopTitle}</h2>
        <p style="font-size: 15px; color: #e5e5e5; line-height: 1.7;">
          مرحباً <strong>${userName || 'عزيزي المستخدم'}</strong>،<br/>
          ${
            isReset
              ? 'لقد طلبت استرجاع وتغيير كلمة المرور الخاصة بحسابك.'
              : 'مرحباً بك! لتأكيد بريدك Gmail وتفعيل حسابك لأول مرة، يرجى استخدام الكود التالي:'
          }
        </p>
        <div style="background: #1c1917; border: 2px dashed #f59e0b; border-radius: 12px; padding: 18px; text-align: center; margin: 22px 0;">
          <div style="font-size: 12px; color: #a8a29e; margin-bottom: 6px;">كود التحقق المكون من 6 أرقام</div>
          <div style="font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #fbbf24; font-family: monospace;">${otp}</div>
        </div>
        <p style="font-size: 13px; color: #a8a29e;">
          ⏳ هذا الكود صالح لمدة <strong>5 دقائق</strong> فقط. لا تشاركه مع أي شخص.
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: `"${shopTitle}" <${gmailUser}>`,
      to,
      subject,
      html: htmlBody,
    });

    return res.status(200).json({
      success: true,
      delivered: true,
      deliveryMethod: 'nodemailer_gmail',
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      delivered: false,
      code: 'NODEMAILER_SEND_FAILED',
      error: err?.message || 'فشل إرسال الرسالة عبر Nodemailer.',
    });
  }
}
