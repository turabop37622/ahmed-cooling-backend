const axios = require('axios');

// One-time code emails (sign-up verification and password reset), in Arabic and English.
// Email clients ignore most modern CSS, so the layout is a single centred table with inline styles only,
// and every image has alt text (many inboxes block images until the reader allows them).

const SITE_URL = 'https://www.ahmedcoolingworkshop.com';
const LOGO_URL = `${SITE_URL}/logo-en.png`;
const SUPPORT_EMAIL = 'ahmedcoolingworkshop@gmail.com';
const SUPPORT_PHONE = '+966 59 019 2146';
const WHATSAPP_URL = 'https://wa.me/966590192146';
const EXPIRES_MINUTES = 10;

const COPY = {
  verify: {
    subject: 'رمز التحقق من بريدك | Your verification code — Ahmed Cooling',
    preheader: `Your Ahmed Cooling verification code. It expires in ${EXPIRES_MINUTES} minutes.`,
    en: {
      title: 'Verify your email',
      intro: 'Thanks for signing up with Ahmed Cooling Workshop. Enter this code to verify your email and activate your account:',
      ignore: 'If you did not create an account, you can safely ignore this email.',
    },
    ar: {
      title: 'تأكيد بريدك الإلكتروني',
      intro: 'شكراً لتسجيلك في ورشة أحمد للتبريد. أدخل الرمز التالي لتأكيد بريدك وتفعيل حسابك:',
      ignore: 'إذا لم تقم بإنشاء حساب، يمكنك تجاهل هذه الرسالة.',
    },
  },
  reset: {
    subject: 'رمز إعادة تعيين كلمة المرور | Password reset code — Ahmed Cooling',
    preheader: `Your Ahmed Cooling password reset code. It expires in ${EXPIRES_MINUTES} minutes.`,
    en: {
      title: 'Reset your password',
      intro: 'We received a request to reset the password for your Ahmed Cooling account. Enter this code to choose a new password:',
      ignore: 'If you did not ask to reset your password, ignore this email — your password stays the same.',
    },
    ar: {
      title: 'إعادة تعيين كلمة المرور',
      intro: 'تلقينا طلباً لإعادة تعيين كلمة مرور حسابك في ورشة أحمد للتبريد. أدخل الرمز التالي لاختيار كلمة مرور جديدة:',
      ignore: 'إذا لم تطلب إعادة تعيين كلمة المرور، تجاهل هذه الرسالة وستبقى كلمة مرورك كما هي.',
    },
  },
};

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// "123456" -> "123 456" so it is easy to read and copy
const spacedCode = (code) => (code.length === 6 ? `${code.slice(0, 3)}&nbsp;${code.slice(3)}` : code);

function buildHtml({ code, purpose, name }) {
  const copy = COPY[purpose] || COPY.verify;
  const safeName = escapeHtml(String(name || '').trim().split(/\s+/)[0] || '');
  const helloEn = safeName ? `Hi ${safeName},` : 'Hi,';
  const helloAr = safeName ? `مرحباً ${safeName}،` : 'مرحباً،';
  const year = new Date().getFullYear();
  const font = "'Segoe UI', Tahoma, Arial, sans-serif";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(copy.en.title)}</title>
</head>
<body style="margin:0;padding:0;background:#EEF3FB;-webkit-text-size-adjust:100%;">
<!-- Preview text shown next to the subject in the inbox -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(copy.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EEF3FB;">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px rgba(15,23,42,0.08);">

        <!-- Brand bar -->
        <tr>
          <td style="height:6px;background:linear-gradient(90deg,#1D4ED8,#22D3EE);background-color:#2563EB;font-size:0;line-height:0;">&nbsp;</td>
        </tr>

        <!-- Logo -->
        <tr>
          <td align="center" style="padding:28px 32px 8px;">
            <a href="${SITE_URL}" style="text-decoration:none;">
              <img src="${LOGO_URL}" width="150" alt="Ahmed Cooling Workshop" style="display:block;border:0;width:150px;max-width:150px;height:auto;font-family:${font};font-size:18px;font-weight:700;color:#0F172A;">
            </a>
          </td>
        </tr>

        <!-- English -->
        <tr>
          <td dir="ltr" style="padding:16px 36px 0;font-family:${font};text-align:left;">
            <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0F172A;font-weight:700;">${escapeHtml(copy.en.title)}</h1>
            <p style="margin:0 0 6px;font-size:15px;line-height:1.6;color:#334155;">${helloEn}</p>
            <p style="margin:0;font-size:15px;line-height:1.6;color:#334155;">${escapeHtml(copy.en.intro)}</p>
          </td>
        </tr>

        <!-- Code -->
        <tr>
          <td align="center" style="padding:24px 36px 8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:16px;">
              <tr>
                <td align="center" style="padding:18px 36px 6px;font-family:${font};font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#1D4ED8;font-weight:700;">
                  Your code &nbsp;·&nbsp; رمزك
                </td>
              </tr>
              <tr>
                <td align="center" dir="ltr" style="padding:0 36px 18px;font-family:'Courier New',Consolas,monospace;font-size:38px;line-height:1.2;letter-spacing:8px;color:#0F172A;font-weight:700;">
                  ${spacedCode(code)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:6px 36px 4px;font-family:${font};font-size:13px;line-height:1.6;color:#64748B;">
            ⏱ This code expires in <strong style="color:#0F172A;">${EXPIRES_MINUTES} minutes</strong>.<br>
            <span dir="rtl">ينتهي الرمز خلال <strong style="color:#0F172A;">${EXPIRES_MINUTES} دقائق</strong></span>
          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="padding:22px 36px 0;"><div style="height:1px;background:#E2E8F0;font-size:0;line-height:0;">&nbsp;</div></td>
        </tr>

        <!-- Arabic -->
        <tr>
          <td dir="rtl" style="padding:20px 36px 0;font-family:Tahoma,'Segoe UI',Arial,sans-serif;text-align:right;">
            <h2 style="margin:0 0 10px;font-size:20px;line-height:1.4;color:#0F172A;font-weight:700;">${escapeHtml(copy.ar.title)}</h2>
            <p style="margin:0 0 6px;font-size:15px;line-height:1.8;color:#334155;">${helloAr}</p>
            <p style="margin:0;font-size:15px;line-height:1.8;color:#334155;">${escapeHtml(copy.ar.intro)}</p>
          </td>
        </tr>

        <!-- Security note -->
        <tr>
          <td style="padding:24px 36px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F8FAFC;border-radius:12px;border:1px solid #E2E8F0;">
              <tr>
                <td dir="ltr" style="padding:14px 18px 6px;font-family:${font};font-size:13px;line-height:1.6;color:#475569;text-align:left;">
                  🔒 Never share this code with anyone. Ahmed Cooling staff will never ask for it.<br>${escapeHtml(copy.en.ignore)}
                </td>
              </tr>
              <tr>
                <td dir="rtl" style="padding:0 18px 14px;font-family:Tahoma,'Segoe UI',Arial,sans-serif;font-size:13px;line-height:1.8;color:#475569;text-align:right;">
                  لا تشارك هذا الرمز مع أي شخص، ولن يطلبه منك فريق ورشة أحمد أبداً. ${escapeHtml(copy.ar.ignore)}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Help -->
        <tr>
          <td align="center" style="padding:24px 36px 28px;font-family:${font};font-size:13px;line-height:1.7;color:#64748B;">
            Need help? &nbsp;·&nbsp; <span dir="rtl">تحتاج مساعدة؟</span><br>
            <a href="${WHATSAPP_URL}" style="color:#16A34A;text-decoration:none;font-weight:700;">WhatsApp</a>
            &nbsp;·&nbsp;
            <a href="tel:+966590192146" style="color:#2563EB;text-decoration:none;font-weight:700;" dir="ltr">${SUPPORT_PHONE}</a>
            &nbsp;·&nbsp;
            <a href="mailto:${SUPPORT_EMAIL}" style="color:#2563EB;text-decoration:none;font-weight:700;">${SUPPORT_EMAIL}</a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center" style="background:#0F172A;padding:20px 24px;font-family:${font};font-size:12px;line-height:1.7;color:#94A3B8;">
            <strong style="color:#FFFFFF;">Ahmed Cooling Workshop</strong> &nbsp;·&nbsp; <span dir="rtl">ورشة أحمد للتبريد</span><br>
            AC &amp; home appliance repair in Jeddah &amp; Makkah<br>
            <a href="${SITE_URL}" style="color:#7DD3FC;text-decoration:none;">ahmedcoolingworkshop.com</a> &nbsp;·&nbsp; © ${year}
          </td>
        </tr>
      </table>
      <p style="margin:16px 0 0;font-family:${font};font-size:11px;color:#94A3B8;">This is an automated message, please do not reply. &nbsp;·&nbsp; <span dir="rtl">رسالة تلقائية، يرجى عدم الرد</span></p>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// Plain-text part for clients that do not show HTML (and it helps keep the email out of spam)
function buildText({ code, purpose, name }) {
  const copy = COPY[purpose] || COPY.verify;
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  return [
    `${copy.en.title}`,
    '',
    first ? `Hi ${first},` : 'Hi,',
    copy.en.intro,
    '',
    `Code: ${code}`,
    `It expires in ${EXPIRES_MINUTES} minutes. Never share it with anyone.`,
    copy.en.ignore,
    '',
    '---',
    copy.ar.title,
    copy.ar.intro,
    `الرمز: ${code}`,
    `ينتهي الرمز خلال ${EXPIRES_MINUTES} دقائق. لا تشاركه مع أي شخص.`,
    copy.ar.ignore,
    '',
    `Ahmed Cooling Workshop — ${SITE_URL}`,
    `WhatsApp / Call: ${SUPPORT_PHONE}`,
  ].join('\n');
}

// Sends a one-time code. `purpose` is 'verify' (sign-up) or 'reset' (forgot password); `name` personalises the greeting.
const sendEmail = async (to, otp, purpose = 'verify', { name } = {}) => {
  const copy = COPY[purpose] || COPY.verify;
  const code = String(otp).replace(/\D/g, '');
  try {
    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: {
          name: 'Ahmed Cooling Workshop',
          email: process.env.EMAIL_FROM || process.env.ADMIN_EMAIL,
        },
        to: [{ email: to, ...(name ? { name: String(name).slice(0, 100) } : {}) }],
        subject: copy.subject,
        htmlContent: buildHtml({ code, purpose, name }),
        textContent: buildText({ code, purpose, name }),
      },
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    return response.data;
  } catch (err) {
    console.error('❌ Email send failed:', err.response?.data || err.message);
    throw err;
  }
};

module.exports = sendEmail;
module.exports.buildOtpEmailHtml = buildHtml;
