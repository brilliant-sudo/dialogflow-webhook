const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();

// Secure HTTP headers with Helmet to protect against common vulnerabilities
app.use(helmet());

// Log incoming requests with Morgan in 'combined' format for detailed tracking
app.use(morgan('combined'));

// Parse JSON bodies from incoming requests for easier data handling
app.use(express.json());

// Apply rate limiting to the /webhook endpoint: 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes in milliseconds
  max: 100, // Max requests per IP in the window
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/webhook', limiter);

// Simulated dynamic data storage with caching to reduce API calls
let cachedCenters = null;
let lastFetchTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // Cache duration set to 5 minutes

// Fetch center data with caching to optimize performance
async function fetchCenters() {
  if (!cachedCenters || Date.now() - lastFetchTime > CACHE_DURATION) {
    // Simulate an external API call with a 1-second delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    cachedCenters = {
      davis: {
        services: [
          { name: "whole-body cryotherapy", booking_link: "https://hirefrederick.com/us-cryotherapy-davis/whole-body" },
          { name: "cryo facial", booking_link: "https://hirefrederick.com/us-cryotherapy-davis/facial" }
        ],
        general_booking_link: "https://hirefrederick.com/us-cryotherapy-davis",
        business_link: "https://g.co/kgs/zufxqGm",
        hours: "Mon-Fri: 10am-6pm, Sat: 10am-4pm, Sun: Closed"
      },
      roseville: {
        services: [
          { name: "whole-body cryotherapy", booking_link: "https://hirefrederick.com/us-cryotherapy-roseville/whole-body" },
          { name: "localized treatments", booking_link: "https://hirefrederick.com/us-cryotherapy-roseville/localized" }
        ],
        general_booking_link: "https://hirefrederick.com/us-cryotherapy-roseville",
        business_link: "https://g.co/kgs/d1SZgA2",
        hours: "Mon-Fri: 9am-7pm, Sat: 9am-5pm, Sun: 10am-4pm"
      },
      pleasanton: {
        services: [
          { name: "cryo facial", booking_link: "https://hirefrederick.com/us-cryotherapy-pleasanton/facial" },
          { name: "localized treatments", booking_link: "https://hirefrederick.com/us-cryotherapy-pleasanton/localized" }
        ],
        general_booking_link: "https://hirefrederick.com/us-cryotherapy-pleasanton",
        business_link: "https://g.co/kgs/duuTmC6",
        hours: "Mon-Fri: 10am-6pm, Sat: 10am-4pm, Sun: Closed"
      },
      "fort cavazos": {
        services: [
          { name: "whole-body cryotherapy", booking_link: "https://hirefrederick.com/us-cryotherapy-fort-cavazos/whole-body" },
          { name: "cryo facial", booking_link: "https://hirefrederick.com/us-cryotherapy-fort-cavazos/facial" },
          { name: "localized treatments", booking_link: "https://hirefrederick.com/us-cryotherapy-fort-cavazos/localized" }
        ],
        general_booking_link: "https://hirefrederick.com/us-cryotherapy-fort-cavazos",
        business_link: "https://g.co/kgs/dgh16ZW",
        hours: "Mon-Fri: 8am-8pm, Sat-Sun: 9am-5pm"
      }
    };
    lastFetchTime = Date.now();
    console.log('Center data refreshed and cached');
  }
  return cachedCenters;
}

// Arrays of variable responses to keep user interactions engaging
const bookingConfirmations = [
  "Awesome! You can book your {service} at {center} here: {booking_link} You’re making a great choice—let me know if you need anything else! 😊",
  "Great pick! Book your {service} at {center} with this link: {booking_link} Any questions? I’m here to help!",
  "You’re all set! Schedule your {service} at {center} here: {booking_link} Excited for you—let me know if you need more assistance! 😊"
];

const explanations = [
  "Cryotherapy is a fantastic way to boost recovery! It uses cold temps to reduce inflammation, lift your energy, and even improve your mood—all in just a few minutes. Want to try it? I can help you book! 😊",
  "Cryotherapy speeds up recovery with cold temperatures that ease inflammation and boost energy. It’s quick, safe, and feels amazing! Ready to book a session? 😊",
  "With cryotherapy, you get less inflammation, better mood, and more energy in just minutes! It’s a wellness game-changer. Shall I help you book? 😊"
];

// Main webhook endpoint to handle incoming requests
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    console.log('Webhook request received:', JSON.stringify(body));

    const intent = body.queryResult?.intent?.displayName || '';
    const parameters = body.queryResult?.parameters || {};
    let center = parameters.center ? parameters.center.toLowerCase() : '';
    let service = parameters.service ? parameters.service.toLowerCase() : '';

    // Validate user inputs to ensure data integrity
    const validCenters = ["davis", "roseville", "pleasanton", "fort cavazos"];
    if (center && !validCenters.includes(center)) {
      return res.json({
        fulfillmentText: `Oops! ${center} isn’t one of our centers. We have Davis, Roseville, Pleasanton, and Fort Cavazos. Which one would you like?`
      });
    }
    if (service && typeof service !== 'string') {
      return res.json({
        fulfillmentText: "Hmm, that service doesn’t look right. Could you specify it again?"
      });
    }

    const centers = await fetchCenters();
    const allCenters = Object.keys(centers);
    let responseText = '';

    // Handle different user intents
    if (intent === 'Book Appointment') {
      console.log(`Booking requested - Center: ${center}, Service: ${service}`);
      if (!center) {
        if (service) {
          // Find centers offering the specified service by checking service names
          const availableCenters = allCenters.filter(c =>
            centers[c].services.some(s => s.name.toLowerCase() === service)
          );
          responseText = availableCenters.length
            ? `Hi! I’m Jen. We offer ${service} at ${availableCenters.join(', ')}. Which location works for you?`
            : `Hi! I’m Jen. Sorry, ${service} isn’t available at our centers. Can I help with something else?`;
        } else {
          responseText = "Hi! I’m Jen, your US Cryotherapy assistant. Which center would you like to visit? We’ve got Davis, Roseville, Pleasanton, and Fort Cavazos!";
        }
      } else {
        const centerData = centers[center];
        if (service) {
          // Find the service object matching the specified service
          const serviceData = centerData.services.find(s => s.name.toLowerCase() === service);
          if (serviceData) {
            // Service exists, use its specific booking link
            const booking_link = serviceData.booking_link;
            const randomResponse = bookingConfirmations[Math.floor(Math.random() * bookingConfirmations.length)]
              .replace('{service}', service)
              .replace('{center}', center)
              .replace('{booking_link}', booking_link);
            responseText = randomResponse;
          } else {
            // Service not offered, list available services and provide general link
            const servicesList = centerData.services.map(s => s.name).join(', ');
            responseText = `Sorry, ${service} isn’t offered at ${center}. We have ${servicesList}. Book here: ${centerData.general_booking_link} Need help picking?`;
          }
        } else {
          // No service specified, use the general booking link
          const booking_link = centerData.general_booking_link;
          const randomResponse = bookingConfirmations[Math.floor(Math.random() * bookingConfirmations.length)]
            .replace('{service}', 'session')
            .replace('{center}', center)
            .replace('{booking_link}', booking_link);
          responseText = randomResponse;
        }
      }
    } else if (intent === 'Explain Cryotherapy') {
      responseText = explanations[Math.floor(Math.random() * explanations.length)];
    } else if (intent === 'Reschedule Appointment') {
      if (center && centers[center]) {
        const business_link = centers[center].business_link;
        responseText = `To reschedule at ${center}, please call them directly. Contact info here: ${business_link} They’ll sort it out for you!`;
      } else {
        responseText = "Please call your center to reschedule. Tell me which one, and I’ll get you the contact link!";
      }
    } else if (intent === 'Address Concerns') {
      responseText = "No stress! Cryotherapy is safe, fast (2-3 minutes), and super refreshing. Our staff guides you every step. Any specific worries I can ease? 😊";
    } else if (intent === 'Provide Center Information') {
      if (center && centers[center]) {
        const { services, hours, business_link } = centers[center];
        // Extract service names from the array of service objects
        const servicesList = services.map(s => s.name).join(', ');
        responseText = `Here’s the scoop on ${center}:\n- **Services**: ${servicesList}\n- **Hours**: ${hours}\n- **More Info**: ${business_link}\nWant to book?`;
      } else {
        responseText = "We’ve got centers in Davis, Roseville, Pleasanton, and Fort Cavazos. Which one are you curious about?";
      }
    } else {
      responseText = "Oops, I didn’t catch that! I can book appointments, explain cryotherapy, or share center info. What’s on your mind? 😊";
    }

    return res.json({ fulfillmentText: responseText });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({
      fulfillmentText: "Sorry, something went wrong on my end. Try again soon!"
    });
  }
});

// Health-check endpoint for monitoring app status
app.get('/health', (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    cacheStatus: lastFetchTime ? `Last updated: ${new Date(lastFetchTime).toISOString()}` : "Not cached"
  });
});

module.exports = app;
