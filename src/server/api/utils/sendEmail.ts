import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport/index";

// import SMTPTransport from "nodemailer/lib/smtp-transport";

interface EmailOptions {
    email: string;
    subject: string;
    message: string;
    text?: string;
    html?: string;
}

const sendEmail = async (options: EmailOptions) => {
    // 1 Create transporter
    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: Number(process.env.EMAIL_PORT),
        auth: {
            user: process.env.EMAIL_USERNAME,
            pass: process.env.EMAIL_PASSWORD,
        },
    } as SMTPTransport.Options); // <--- type cast

    // 2 Define email options
    const mailOptions = {
        from: "back-end-final.ent <hello@jdough.com>",
        to: options.email,
        subject: options.subject,
        text: options.message,
        // html: `<p>${options.message}</p>`
    };

    // 3 Send email
    await transporter.sendMail(mailOptions);
};

export default sendEmail;