import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOtpEmail(email: string, code: string, name: string) {
    await resend.emails.send({
        from: process.env.FROM_EMAIL!,
        to: email,
        subject: 'Your SyncBeat password reset code',
        html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; background: #070710; color: #EEEEFF; padding: 40px 32px; border-radius: 24px; border: 1px solid rgba(123,110,255,0.2);">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="font-size: 40px; margin-bottom: 8px;">🎵</div>
          <h1 style="font-size: 24px; font-weight: 800; color: #EEEEFF; margin: 0;">SyncBeat</h1>
        </div>
        <h2 style="font-size: 20px; font-weight: 700; color: #EEEEFF; margin-bottom: 8px;">Reset your password</h2>
        <p style="color: #8A8AAC; font-size: 15px; line-height: 1.6; margin-bottom: 32px;">
          Hi ${name}, use the code below to reset your password. It expires in <strong style="color: #EEEEFF;">10 minutes</strong>.
        </p>
        <div style="background: #131326; border: 1px solid rgba(123,110,255,0.25); border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 32px;">
          <div style="font-size: 40px; font-weight: 800; letter-spacing: 12px; color: #7B6EFF;">${code}</div>
        </div>
        <p style="color: #454568; font-size: 13px; text-align: center;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
    });
}