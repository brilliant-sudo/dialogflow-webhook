const express = require('express');
const { google } = require('googleapis');
const phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();
const nodemailer = require('nodemailer');

const express = require('express');
const { google } = require('googleapis');
const phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());

/**
 * @route GET /
 * @description Verifies webhook deployment status. Returns 200 OK with a status message.
 */
app.get('/', (req, res) => {
  res.status(200).send('Webhook is running! Send POST requests to /api/webhook');
});

/**
 * @param {string} name User's full name.
 * @returns {boolean} True if the name contains only letters and spaces with at least two words.
 */
function isValidName(name) {
  if (typeof name !== 'string') {
    console.error("isValidName: Received non-string input:", name);
    return false;
  }
  const trimmedName = name.trim();
  const nameParts = trimmedName.split(/\s+/).filter(part => part.length > 0);
  return /^[A-Za-z\s]+$/.test(trimmedName) && nameParts.length >= 2;
}

/**
 * @param {string} email User's email address.
 * @returns {boolean} True if the email matches a common format.
 */
function isValidEmail(email) {
  if (typeof email !== 'string') {
    console.error("isValidEmail: Received non-string input:", email);
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * @param {string} phone User's phone number.
 * @returns {boolean} True if the phone number is considered valid by the `google-libphonenumber` library.
 */
function isValidPhoneNumber(phone) {
  if (typeof phone !== 'string') {
    console.error("isValidPhoneNumber: Received non-string input:", phone);
    return false;
  }
  try {
    const parsed = phoneUtil.parse(phone); // No region specified for international numbers
    return phoneUtil.isValidNumber(parsed);
  } catch (error) {
    console.error("Phone number parsing error:", error.message, "for phone:", phone);
    return false;
  }
}

/**
 * @async
 * @param {string} name User's full name.
 * @param {string} email User's email address.
 * @param {string} phone User's phone number.
 * @throws {Error} If saving to Google Sheets fails.
 */
async function saveToGoogleSheets(name, email, phone) {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Sheet1!A1:C1',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[name, email, phone]],
      },
    });
    console.log('User info saved to Google Sheets successfully.');
  } catch (error) {
    console.error('Error saving to Google Sheets:', error);
    throw error;
  }
}

/**
 * @async
 * @param {string} recipientEmail User's email address to send confirmation to.
 * @param {string} userName User's full name to include in the email.
 * @throws {Error} If sending the confirmation email fails.
 */
async function sendConfirmationEmail(recipientEmail, userName) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.EMAIL_AUTH_USER,
        pass: process.env.EMAIL_AUTH_PASS,
      },
    });

    const subject = 'Thank you for visiting US Cryotherapy!';
    const text = `Thank you **${userName}** for sharing your information with **US Cryotherapy**! You can now continue with your booking.`;
    const html = `<p>Thank you <b>${userName}</b> for sharing your information with <b>US Cryotherapy</b>! You can now continue with your booking.</p>`;

    const mailOptions = {
      from: process.env.EMAIL_AUTH_USER,
      to: recipientEmail,
      subject: subject,
      text: text,
      html: html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Confirmation email sent:', info.messageId, 'to:', recipientEmail);
  } catch (error) {
    console.error('Error sending confirmation email:', error);
    throw error;
  }
}

/**
 * @async
 * @route POST /api/webhook
 * @param {express.Request} req Dialogflow request object.
 * @param {express.Response} res Express response object.
 * @returns {Promise<void>}
 */
app.post('/api/webhook', async (req, res) => {
  const params = req.body.queryResult.parameters;

  console.log('Dialogflow raw parameters received:', JSON.stringify(params, null, 2));

  const nameParam = params['fullname'];
  const name = typeof nameParam === 'object' && nameParam !== null && typeof nameParam.name === 'string'
               ? String(nameParam.name).trim()
               : String(nameParam || '').trim();

  const email = String(params['email'] || '').trim();
  const phone = String(params['phone-number'] || '').trim();

  console.log('Extracted and processed values for validation:', { name, email, phone });

  if (!name || !email || !phone) {
    console.error("Initial parameter check failed: Missing required parameters.");
    return res.json({
      followupEventInput: {
        name: 'collect_user_info',
        languageCode: 'en',
      },
      fulfillmentText: "I seem to be missing some information. Could you please provide your full name, email address, and phone number?",
    });
  }

  const nameValid = isValidName(name);
  const emailValid = isValidEmail(email);
  const phoneValid = isValidPhoneNumber(phone);

  console.log('Individual validation results:', { nameValid, emailValid, phoneValid });

  if (!nameValid || !emailValid || !phoneValid) {
    console.log('Validation failed for one or more fields. Re-triggering collect_user_info.');
    let invalidFieldsMessage = '';
    if (!nameValid) invalidFieldsMessage += 'your full name (at least two names), ';
    if (!emailValid) invalidFieldsMessage += 'a valid email address, ';
    if (!phoneValid) invalidFieldsMessage += 'a valid phone number, ';

    invalidFieldsMessage = invalidFieldsMessage.replace(/,\s*$/, '.');

    return res.json({
      followupEventInput: {
        name: 'collect_user_info',
        languageCode: 'en',
      },
      fulfillmentText: `The information you provided for ${invalidFieldsMessage} is not in a valid format. Could you please double-check and provide it again? For your name, please ensure you provide at least your first and last name. For the phone number, please ensure it's a valid international format.`,
    });
  }

  try {
    await saveToGoogleSheets(name, email, phone);
    await sendConfirmationEmail(email, name); // Pass the name to the email function

    return res.json({
      followupEventInput: {
        name: 'trigger-booking-intent',
        languageCode: 'en',
      },
    });
  } catch (error) {
    console.error('Error during data processing:', error);
    return res.status(500).json({
      fulfillmentText: "I'm sorry, I encountered an error while processing your information. Please try again later.",
    });
  }
});

module.exports = app;
