// services/emailService.js
const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    const service = process.env.EMAIL_SERVICE || 'gmail';
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASSWORD;

    if (!user || !pass) {
      console.warn('Email credentials not configured (EMAIL_USER / EMAIL_PASSWORD). Emails will fail until configured.');
    }

    // Create transporter with logger / debug set in options (do not mutate after creation)
    this.transporter = nodemailer.createTransport({
      service,
      auth: {
        user,
        pass
      },
      logger: process.env.NODE_ENV === 'development',
      debug: process.env.NODE_ENV === 'development'
    });
  }

  /**
   * Send a quiz invitation email to a single student
   * @param {string} studentEmail
   * @param {string} quizTitle
   * @param {string} uniqueLink
   * @param {string} teacherName
   */
  async sendQuizInvitation(studentEmail, quizTitle, uniqueLink, teacherName) {
    const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@example.com';
    const mailOptions = {
      from: `"${teacherName || 'Teacher'}" <${fromEmail}>`,
      to: studentEmail,
      subject: `Quiz Invitation: ${quizTitle}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg,#667eea 0%,#764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0; font-weight: bold; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            .info-box { background: white; padding: 12px; border-left: 4px solid #667eea; margin: 12px 0; border-radius: 4px; }
            a { color: #2a56c6; word-break: break-all; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📝 Quiz Invitation</h1>
            </div>
            <div class="content">
              <h2>Hello!</h2>
              <p>You have been invited by <strong>${teacherName || 'Teacher'}</strong> to attempt a quiz titled <strong>${quizTitle}</strong>.</p>

              <div class="info-box">
                <h3 style="margin:0 0 6px 0;">Quiz: ${quizTitle}</h3>
                <p style="margin:0;">Click the button below to access your personalized quiz link.</p>
              </div>

              <p style="text-align:center;">
                <a href="${uniqueLink}" class="button" target="_blank" rel="noopener noreferrer">Start Quiz</a>
              </p>

              <p><strong>Important Instructions:</strong></p>
              <ul>
                <li>This link is unique to you and should not be shared</li>
                <li>You'll need to enter your details before starting</li>
                <li>Complete the quiz within the allocated time</li>
                <li>Make sure you have a stable internet connection</li>
              </ul>

              <div class="info-box">
                <p style="margin: 0;"><strong>Link:</strong> <a href="${uniqueLink}">${uniqueLink}</a></p>
              </div>

              <p>Good luck with your quiz!</p>
            </div>
            <div class="footer">
              <p>This is an automated email. Please do not reply.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`Email sent to ${studentEmail}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error(`Error sending email to ${studentEmail}:`, error && error.message ? error.message : error);
      const message = error && error.message ? error.message : 'Unknown email error';
      // throw so caller knows this send failed
      throw new Error(`Failed to send to ${studentEmail}: ${message}`);
    }
  }

  async verifyConnection() {
    try {
      await this.transporter.verify();
      console.log('Email transporter verified and ready');
      return true;
    } catch (error) {
      console.error('Email transporter verify failed:', error && error.message ? error.message : error);
      return false;
    }
  }
}

module.exports = new EmailService();
