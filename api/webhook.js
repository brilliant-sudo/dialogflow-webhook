const express = require('express');
const { google } = require('googleapis');
const phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();
const app = express();

app.use(express.json());

// --- Basic GET route for testing deployment ---
// This route will respond when you visit your Vercel URL in a browser (e.g., https://your-vercel-app.vercel.app/)
app.get('/', (req, res) => {
  res.status(200).send('Webhook is running! Send POST requests to /api/webhook');
});

// --- Validation Functions ---
// Fullname: letters only, 2–3 words
function isValidName(name) {
  // Ensure name is a string before trimming
  if (typeof name !== 'string') {
    console.error("isValidName: Received non-string input:", name);
    return false;
  }
  // The regex allows 1 to 3 words composed of letters
  return /^[A-Za-z]+( [A-Za-z]+){1,2}$/.test(name.trim());
}

// Email: common format check
function isValidEmail(email) {
  // Ensure email is a string before trimming
  if (typeof email !== 'string') {
    console.error("isValidEmail: Received non-string input:", email);
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// Phone: international format check using libphonenumber
function isValidPhoneNumber(phone) {
  // Ensure phone is a string
  if (typeof phone !== 'string') {
    console.error("isValidPhoneNumber: Received non-string input:", phone);
    return false;
  }
  try {
    // Important: Use your primary user base's country code for default region.
    // For Zambia, it's 'ZM'. This helps parse local numbers without the '+' prefix correctly.
    // If your users are truly global and always provide '+' prefix, you can omit 'ZM'.
    const parsed = phoneUtil.parse(phone, 'ZM');
    return phoneUtil.isValidNumber(parsed);
  } catch (error) {
    // Log specific parsing errors from libphonenumber for debugging
    console.error("Phone number parsing error:", error.message, "for phone:", phone);
    return false;
  }
}

// --- Google Sheets Integration ---
async function saveToGoogleSheets(name, email, phone) {
  // IMPORTANT: AUTHENTICATION USING ENVIRONMENT VARIABLES (SECURE WAY)
  // Ensure you have GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY set in Vercel's project environment variables.
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      // Replace escaped newlines in the private key string
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

  await sheets.spreadsheets.values.append({
    spreadsheetId: '1XM1x2xZvWjF99P4o3TP1Od9rFXhozfx-ICKr-vbnRRc', // <<-- MAKE SURE THIS IS YOUR CORRECT SPREADSHEET ID
    range: 'Sheet1!A1:C1', // Make sure your Google Sheet has columns A, B, C set up for Fullname, Email, Phone Number
    valueInputOption: 'USER_ENTERED', // Data is parsed as if entered by a user
    resource: {
      values: [[name, email, phone]],
    },
  });
}

// --- Webhook POST Endpoint ---
app.post('/api/webhook', async (req, res) => {
  const params = req.body.queryResult.parameters;

  // Log raw parameters received from Dialogflow for debugging
  console.log('Dialogflow raw parameters received:', JSON.stringify(params, null, 2));

  // --- CORRECTED FULLNAME EXTRACTION ---
  // Handles `fullname` which might be an object { name: '...' } (from Dialogflow) or a simple string.
  const nameParam = params['fullname'];
  const name = typeof nameParam === 'object' && nameParam !== null && typeof nameParam.name === 'string'
               ? String(nameParam.name) // If it's a valid object with a 'name' property, use that value and ensure it's a string.
               : String(nameParam || ''); // Otherwise, use the parameter value directly (convert to string, handle null/undefined as empty string).
  // --- END CORRECTED FULLNAME EXTRACTION ---

  const email = params['email'];
  const phone = params['phone-number']; // This should now correctly pick up the phone number after you fixed the typo in Dialogflow.

  // Log extracted and processed values for debugging before validation
  console.log('Extracted and processed values for validation:', { name, email, phone });

  // --- Initial Check for Missing/Empty Parameters ---
  // If 'name', 'email', or 'phone' are empty strings after extraction (meaning Dialogflow didn't provide them validly),
  // or if they are null/undefined.
  if (!name || !email || !phone) {
      console.error("Initial parameter check failed: One or more required parameters are empty or missing after extraction.");
      return res.json({
          followupEventInput: {
              name: 'collect_user_info',
              languageCode: 'en',
          },
          fulfillmentText: "I seem to be missing some information. Could you please provide your full name, email address, and phone number?",
      });
  }

  // --- Validate Extracted Parameters ---
  const nameValid = isValidName(name);
  const emailValid = isValidEmail(email);
  const phoneValid = isValidPhoneNumber(phone);

  console.log('Individual validation results:', { nameValid, emailValid, phoneValid });

  if (!nameValid || !emailValid || !phoneValid) {
    console.log('Validation failed for one or more fields. Re-triggering collect_user_info.');
    return res.json({
      followupEventInput: {
        name: 'collect_user_info',
        languageCode: 'en',
      },
      fulfillmentText: "The information you provided is not in a valid format. Can you please provide your full name, a valid email address, and a valid phone number?", // More specific error message to the user
    });
  }

  // --- If all validations pass, save to Google Sheets and trigger next intent ---
  try {
    await saveToGoogleSheets(name, email, phone);
    console.log('User info saved to Google Sheets successfully.');
    return res.json({
      followupEventInput: {
        name: 'trigger-booking-intent', // Event to trigger your next intent after successful data collection
        languageCode: 'en',
      },
    });
  } catch (error) {
    console.error('Error saving to Google Sheets:', error);
    // Return a user-friendly error message to Dialogflow
    return res.status(500).json({
      fulfillmentText: "I'm sorry, I encountered an error while trying to save your information. Please try again later.",
    });
  }
});

module.exports = app;
