const express = require('express');
const { google } = require('googleapis');
const phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();
const app = express();

app.use(express.json());

// --- START: Added for basic browser test ---
// This route will respond when you visit your Vercel URL in a browser (e.g., https://your-vercel-app.vercel.app/)
app.get('/', (req, res) => {
  res.status(200).send('Webhook is running! Send POST requests to /api/webhook');
});
// --- END: Added for basic browser test ---


// Fullname: letters only, 2–3 words
function isValidName(name) {
  return /^[A-Za-z]+( [A-Za-z]+){1,2}$/.test(name.trim());
}

// Email: common format check
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// Phone: international format check using libphonenumber
function isValidPhoneNumber(phone) {
  try {
    const parsed = phoneUtil.parse(phone);
    return phoneUtil.isValidNumber(parsed);
  } catch (error) {
    return false;
  }
}

// Save to Google Sheets under columns: fullname | email address | phone number
async function saveToGoogleSheets(name, email, phone) {
  const auth = new google.auth.GoogleAuth({
    keyFile: 'credentials.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

  await sheets.spreadsheets.values.append({
    spreadsheetId: '1XM1x2xZvWjF99P4o3TP1Od9rFXhozfx-ICKr-vbnRRc', // YOUR SPREADSHEET ID
    range: 'Sheet1!A1:C1',
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: [[name, email, phone]],
    },
  });
}

app.post('/api/webhook', async (req, res) => {
  const params = req.body.queryResult.parameters;
  const name = params['fullname'];
  const email = params['email'];
  const phone = params['phone-number'];

  // It's good practice to check if parameters exist, though Dialogflow usually sends them
  if (!name || !email || !phone) {
      console.error("Missing parameters from Dialogflow:", params);
      return res.json({
          followupEventInput: {
              name: 'collect_user_info',
              languageCode: 'en',
          },
          // Optionally, add a message to Dialogflow to explain the error if needed
          fulfillmentText: "I seem to be missing some information. Can you please provide your full name, email address, and phone number?",
      });
  }

  if (!isValidName(name) || !isValidEmail(email) || !isValidPhoneNumber(phone)) {
    return res.json({
      followupEventInput: {
        name: 'collect_user_info',
        languageCode: 'en',
      },
    });
  }

  try {
    await saveToGoogleSheets(name, email, phone);
    return res.json({
      followupEventInput: {
        name: 'trigger-booking-intent',
        languageCode: 'en',
      },
    });
  } catch (error) {
    console.error('Error saving to Google Sheets:', error);
    return res.status(500).send('Error saving to Google Sheets.');
  }
});

module.exports = app;
