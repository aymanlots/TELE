import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProd = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

interface SendOtpRequestBody {
  to: string;
  otp: string;
  subject?: string;
  type?: 'register_verification' | 'password_reset' | 'test';
  storeName?: string;
  userName?: string;
  customGmailUser?: string;
  customGmailAppPassword?: string;
}

function buildEmailHtml(params: {
  otp: string;
  type: string;
  storeName: string;
  userName?: string;
}): string {
  const isRegister = params.type === 'register_verification';
  const isTest = params.type === 'test';
  const titleAr = isTest
    ? 'اختبار إعدادات البريد الإلكتروني'
    : isRegister
    ? 'تأكيد البريد الإلكتروني للتسجيل'
    : 'استرجاع كلمة المرور';
  const titleFr = isTest
    ? 'Test des paramètres Email'
    : isRegister
    ? 'Vérification Email d\'inscription'
    : 'Récupération du mot de passe';
  const subtitleAr = isRegister
    ? 'مرحباً بك في نظام المحل الذهبي! المرجو استخدام الرمز التالي لتفعيل حساب المحل الخاص بك:'
    : isTest
    ? 'هذه رسالة اختبارية لتأكيد عمل ربط Nodemailer بنجاح مع حساب Gmail.'
    : 'تلقينا طلباً لإعادة تعيين كلمة المرور لحساب المحل الخاص بك. استخدم الرمز التالي:';
  const subtitleFr = isRegister
    ? 'Bienvenue sur Golden Shop Manager ! Veuillez utiliser ce code pour activer votre compte :'
    : isTest
    ? 'Message test confirmant la connexion Nodemailer avec votre compte Gmail.'
    : 'Une demande de réinitialisation de mot de passe a été initiée. Utilisez le code ci-dessous :';

  return `
  <!DOCTYPE html>
  <html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${titleAr}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #0f1015; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f3f4f6;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f1015; padding: 40px 10px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width: 540px; background: linear-gradient(145deg, #181920 0%, #121319 100%); border: 1px solid #d4af37; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.6);">
            
            <!-- Header Brand Banner -->
            <tr>
              <td style="padding: 32px 30px 20px; text-align: center; border-bottom: 1px solid rgba(212, 175, 55, 0.2);">
                <div style="display: inline-block; padding: 10px 18px; background: rgba(212, 175, 55, 0.12); border: 1px solid rgba(212, 175, 55, 0.4); border-radius: 9999px; margin-bottom: 12px;">
                  <span style="color: #fbbf24; font-weight: 800; font-size: 13px; letter-spacing: 2px;">GOLDEN SHOP MANAGER</span>
                </div>
                <h1 style="margin: 0; color: #fef08a; font-size: 24px; font-weight: 800;">${params.storeName || 'المحل الذهبي'}</h1>
                <p style="margin: 6px 0 0; color: #9ca3af; font-size: 13px;">نظام إدارة محلات الهواتف والإلكترونيات</p>
              </td>
            </tr>

            <!-- Content Area -->
            <tr>
              <td style="padding: 32px 30px;">
                <h2 style="margin: 0 0 12px; color: #ffffff; font-size: 19px; font-weight: 700; text-align: center;">${titleAr}</h2>
                <p style="margin: 0 0 24px; color: #d1d5db; font-size: 14px; line-height: 1.6; text-align: center;">
                  ${subtitleAr}
                </p>

                <!-- 6-Digit OTP Box -->
                <div style="background: #0a0a0d; border: 2px dashed #d4af37; border-radius: 16px; padding: 22px 10px; text-align: center; margin-bottom: 24px;">
                  <div style="color: #9ca3af; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">رمز التحقق (6 أرقام) / CODE OTP</div>
                  <div style="font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 900; letter-spacing: 12px; color: #fbbf24; padding-left: 12px;">
                    ${params.otp}
                  </div>
                  <div style="display: inline-block; margin-top: 10px; padding: 4px 12px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; color: #fca5a5; font-size: 12px; font-weight: 600;">
                    ⏱️ صالح لمدة 5 دقائق فقط (5 minutes)
                  </div>
                </div>

                <!-- French summary -->
                <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 14px 18px; margin-bottom: 24px; text-align: left;" dir="ltr">
                  <p style="margin: 0 0 4px; color: #e5e7eb; font-size: 13px; font-weight: 600;">${titleFr}</p>
                  <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.5;">${subtitleFr}</p>
                </div>

                <!-- Security Notice -->
                <div style="border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 18px; text-align: center;">
                  <p style="margin: 0; color: #ef4444; font-size: 12px; font-weight: 600;">
                    ⚠️ تنبيه أمني: لا تشارك هذا الرمز مع أي شخص آخر، فريق الدعم لن يطلب منك هذا الرمز أبداً.
                  </p>
                  <p style="margin: 4px 0 0; color: #6b7280; font-size: 11px;">
                    إذا لم تكن أنت من طلب هذا الرمز، يمكنك تجاهل هذا البريد بأمان.
                  </p>
                </div>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding: 18px 30px; background-color: #0a0a0e; text-align: center; border-top: 1px solid rgba(255,255,255,0.06);">
                <p style="margin: 0; color: #6b7280; font-size: 11px;">
                  © ${new Date().getFullYear()} Golden Shop Manager • Télé-Projet Maroc
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Health check endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'Golden Shop Nodemailer Backend',
      time: new Date().toISOString(),
      gmailConfigured: Boolean(process.env.GMAIL_APP_PASSWORD),
    });
  });

  // Send Email OTP endpoint via Nodemailer & Gmail App Password
  app.post('/api/send-email-otp', async (req: Request, res: Response) => {
    try {
      const {
        to,
        otp,
        subject,
        type = 'register_verification',
        storeName = 'المحل الذهبي',
        userName,
        customGmailUser,
        customGmailAppPassword,
      }: SendOtpRequestBody = req.body;

      if (!to || typeof to !== 'string') {
        res.status(400).json({ success: false, error: 'المرجو إدخال بريد إلكتروني صحيح' });
        return;
      }

      const cleanEmail = to.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        res.status(400).json({ success: false, error: 'صيغة البريد الإلكتروني غير صحيحة' });
        return;
      }

      if (!otp || !/^\d{6}$/.test(String(otp).trim())) {
        res.status(400).json({ success: false, error: 'كود التحقق يجب أن يتكون من 6 أرقام' });
        return;
      }

      const cleanOtp = String(otp).trim();

      // Resolve Gmail credentials: priority to in-app store settings, then environment variables
      const resolvedGmailUser =
        (customGmailUser && customGmailUser.trim()) ||
        process.env.GMAIL_USER ||
        'aissaaimanekhlifi@gmail.com';

      const rawAppPass =
        (customGmailAppPassword && customGmailAppPassword.trim()) ||
        process.env.GMAIL_APP_PASSWORD ||
        '';

      // Gmail App Passwords often come with 4-group spaces like 'abcd efgh ijkl mnop'
      const cleanAppPassword = rawAppPass.replace(/\s+/g, '');

      const defaultSubject =
        subject ||
        (type === 'register_verification'
          ? `رمز تأكيد البريد الإلكتروني (${cleanOtp}) - ${storeName}`
          : `رمز استرجاع كلمة المرور (${cleanOtp}) - ${storeName}`);

      const htmlContent = buildEmailHtml({
        otp: cleanOtp,
        type,
        storeName,
        userName,
      });

      // If Gmail App Password is configured, send the real email via Nodemailer
      if (cleanAppPassword) {
        try {
          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
              user: resolvedGmailUser,
              pass: cleanAppPassword,
            },
          });

          const info = await transporter.sendMail({
            from: `"${storeName}" <${resolvedGmailUser}>`,
            to: cleanEmail,
            subject: defaultSubject,
            text: `رمز التحقق الخاص بك هو: ${cleanOtp}. صالح لمدة 5 دقائق.`,
            html: htmlContent,
          });

          console.log(`[Nodemailer] Successfully sent OTP ${cleanOtp} to ${cleanEmail}. MessageId: ${info.messageId}`);
          res.json({
            success: true,
            delivered: true,
            messageId: info.messageId,
            to: cleanEmail,
            provider: 'nodemailer_gmail',
          });
          return;
        } catch (sendError: any) {
          console.error('[Nodemailer Error] Failed to send email:', sendError);
          // Return clear diagnostics and provide fallback so user isn't stuck
          res.status(200).json({
            success: true,
            delivered: false,
            simulated: true,
            warning: `فشل الإرسال عبر Gmail (${sendError?.message || 'Invalid Credentials'}). تم تفعيل الرمز التجريبي لتسهيل الدخول.`,
            otpCode: cleanOtp,
            to: cleanEmail,
          });
          return;
        }
      }

      // If no App Password is set yet, log to console and return simulated response
      console.log(`[Nodemailer Simulation] To: ${cleanEmail} | OTP: ${cleanOtp} | Type: ${type}`);
      res.json({
        success: true,
        delivered: false,
        simulated: true,
        message: 'GMAIL_APP_PASSWORD غير مضبوط في المتغيرات أو الإعدادات. تم تسجيل الرمز للاختبار.',
        otpCode: cleanOtp,
        to: cleanEmail,
      });
    } catch (err: any) {
      console.error('[API send-email-otp error]:', err);
      res.status(500).json({
        success: false,
        error: err?.message || 'حدث خطأ في الخادم أثناء إرسال البريد',
      });
    }
  });

  // Mount Vite middlewares in development or serve dist in production
  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Golden Shop Full-Stack Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
