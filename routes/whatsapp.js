
const express = require('express');
const axios = require('axios');
const router = express.Router();
const Asset = require('../models/Asset');
const User = require('../models/User');
const Booking = require('../models/Booking');

// WhatsApp Configuration
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || 'EAAay5J9VaZBsBPswTZBSf8ogB8iKuVC5IFgh4olxZCjO5jy7ELNrY8bTa45io8KfvgZCyC3ZB0FHEH44sYL3cl0MKUqiGZCgL3X3vLPaJ03ec7NL8BtxZBGn7h5soaUX5ZAAcwBbx1lk7pm4ICd1BkxXMQGoB5iN45aroKVke9T8sSWEZAZB9fFPN6Hv90hnmlFHedFhHZAEDvfqiWttnbN56i83Rsk2sHavaREU7alq45fzUdmiAZDZD';
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || '846227168563844';
const WHATSAPP_API_URL = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'innerspace_verify_token_123';

// Store conversation states (in production, use Redis or database)
const conversationStates = new Map();

// Helper function to send WhatsApp message
async function sendWhatsAppMessage(to, message) {
  try {
    const response = await axios.post(
      WHATSAPP_API_URL,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: message }
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('✅ Message sent successfully to', to);
    return response.data;
  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error.response?.data || error.message);
    throw error;
  }
}

// Helper function to send interactive button message
async function sendInteractiveButtons(to, bodyText, buttons) {
  try {
    const response = await axios.post(
      WHATSAPP_API_URL,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: bodyText },
          action: {
            buttons: buttons.slice(0, 3).map((btn) => ({
              type: 'reply',
              reply: {
                id: btn.id,
                title: btn.title.substring(0, 20)
              }
            }))
          }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('❌ Error sending interactive message:', error.response?.data || error.message);
    throw error;
  }
}

// Helper function to send list message
async function sendListMessage(to, bodyText, buttonText, sections) {
  try {
    const response = await axios.post(
      WHATSAPP_API_URL,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: bodyText },
          action: {
            button: buttonText,
            sections: sections
          }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('❌ Error sending list message:', error.response?.data || error.message);
    throw error;
  }
}

// Generate unique booking ID
function generateBookingId() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `WA${timestamp}${random}`;
}

// Webhook verification
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  console.log('Webhook verification request:', { mode, token });
  
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Webhook verification failed');
    res.sendStatus(403);
  }
});

// Webhook to receive messages
router.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    
    console.log('📥 Webhook received:', JSON.stringify(body, null, 2));
    
    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const messages = value?.messages;
      
      if (messages && messages[0]) {
        const message = messages[0];
        const from = message.from;
        const messageType = message.type;
        
        console.log(`📱 Received ${messageType} message from ${from}`);
        
        let userMessage = '';
        
        if (messageType === 'text') {
          userMessage = message.text.body.toLowerCase().trim();
        } else if (messageType === 'interactive') {
          if (message.interactive.type === 'button_reply') {
            userMessage = message.interactive.button_reply.id;
          } else if (message.interactive.type === 'list_reply') {
            userMessage = message.interactive.list_reply.id;
          }
        }
        
        console.log('💬 Processing message:', userMessage);
        await handleUserMessage(from, userMessage);
      }
      
      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    res.sendStatus(500);
  }
});

// Main message handler
async function handleUserMessage(from, message) {
  const state = conversationStates.get(from) || { step: 'start' };
  
  try {
    console.log(`🔄 Handling message for ${from}, step: ${state.step}, message: ${message}`);
    
    switch (state.step) {
      case 'start':
        if (message === 'book' || message === 'hi' || message === 'hello' || message === 'start') {
          await sendInteractiveButtons(
            from,
            'Welcome to Innerspace! 🏢\n\nHow can I help you today?',
            [
              { id: 'browse_spaces', title: 'Browse Spaces' },
              { id: 'my_bookings', title: 'My Bookings' },
              { id: 'help', title: 'Help' }
            ]
          );
          conversationStates.set(from, { step: 'menu' });
        } else {
          await sendWhatsAppMessage(from, 'Hi! Type "book" to browse available workspaces.');
        }
        break;
        
      case 'menu':
        if (message === 'browse_spaces') {
          await showSpaceTypes(from);
          conversationStates.set(from, { step: 'select_type' });
        } else if (message === 'my_bookings') {
          await showMyBookings(from);
          conversationStates.set(from, { step: 'start' });
        } else if (message === 'help') {
          await sendWhatsAppMessage(
            from,
            'Here\'s how to book:\n\n1️⃣ Choose space type\n2️⃣ Select location\n3️⃣ Pick your space\n4️⃣ Choose date & time\n5️⃣ Confirm booking\n\nType "book" to start!'
          );
          conversationStates.set(from, { step: 'start' });
        }
        break;
        
      case 'select_type':
        state.spaceType = message;
        await showCities(from, message);
        conversationStates.set(from, { ...state, step: 'select_city' });
        break;
        
      case 'select_city':
        state.city = message;
        await showAvailableSpaces(from, state.spaceType, message);
        conversationStates.set(from, { ...state, step: 'select_space' });
        break;
        
      case 'select_space':
        state.assetId = message;
        await showBookingOptions(from, message);
        conversationStates.set(from, { ...state, step: 'select_duration' });
        break;
        
      case 'select_duration':
        state.duration = message;
        await requestDateTime(from);
        conversationStates.set(from, { ...state, step: 'enter_date' });
        break;
        
      case 'enter_date':
        if (isValidDate(message)) {
          state.date = message;
          await requestTime(from);
          conversationStates.set(from, { ...state, step: 'enter_time' });
        } else {
          await sendWhatsAppMessage(from, '❌ Invalid date format. Please use DD/MM/YYYY (e.g., 25/12/2024)');
        }
        break;
        
      case 'enter_time':
        if (isValidTime(message)) {
          state.time = message;
          await requestContactInfo(from);
          conversationStates.set(from, { ...state, step: 'enter_name' });
        } else {
          await sendWhatsAppMessage(from, '❌ Invalid time format. Please use HH:MM (e.g., 14:30)');
        }
        break;
        
      case 'enter_name':
        state.name = message;
        await requestEmail(from);
        conversationStates.set(from, { ...state, step: 'enter_email' });
        break;
        
      case 'enter_email':
        if (isValidEmail(message)) {
          state.email = message;
          state.phone = from;
          await confirmBooking(from, state);
          conversationStates.set(from, { ...state, step: 'confirm' });
        } else {
          await sendWhatsAppMessage(from, '❌ Invalid email format. Please enter a valid email address.');
        }
        break;
        
      case 'confirm':
        if (message === 'confirm_booking') {
          await processBooking(from, state);
          conversationStates.delete(from);
        } else if (message === 'cancel_booking') {
          await sendWhatsAppMessage(from, '❌ Booking cancelled. Type "book" to start over.');
          conversationStates.delete(from);
        }
        break;
        
      default:
        await sendWhatsAppMessage(from, 'Type "book" to start booking a workspace.');
        conversationStates.set(from, { step: 'start' });
    }
  } catch (error) {
    console.error('❌ Error handling message:', error);
    await sendWhatsAppMessage(from, 'Sorry, something went wrong. Please type "book" to try again.');
    conversationStates.delete(from);
  }
}

// Show space types
async function showSpaceTypes(to) {
  await sendListMessage(
    to,
    'What type of workspace are you looking for?',
    'Select Type',
    [{
      title: 'Workspace Types',
      rows: [
        { id: 'meeting_room', title: 'Meeting Room', description: 'Private meeting spaces' },
        { id: 'conference_room', title: 'Conference Room', description: 'Large conference halls' },
        { id: 'hot_desk', title: 'Hot Desk', description: 'Flexible desk space' },
        { id: 'cabin', title: 'Private Cabin', description: 'Enclosed office cabin' },
        { id: 'dedicated_desk', title: 'Dedicated Desk', description: 'Fixed desk space' }
      ]
    }]
  );
}

// Show available cities
async function showCities(to, spaceType) {
  try {
    const cities = await Asset.distinct('location.city', { 
      type: spaceType, 
      status: 'approved',
      isActive: true 
    });
    
    if (cities.length === 0) {
      await sendWhatsAppMessage(to, '❌ No spaces available for this type. Type "book" to try another type.');
      return;
    }
    
    const rows = cities.slice(0, 10).map(city => ({
      id: city.toLowerCase().replace(/\s+/g, '_'),
      title: city,
      description: `Available in ${city}`
    }));
    
    await sendListMessage(
      to,
      'Which city are you looking for?',
      'Select City',
      [{ title: 'Available Cities', rows }]
    );
  } catch (error) {
    console.error('❌ Error fetching cities:', error);
    await sendWhatsAppMessage(to, '❌ Error loading cities. Please try again.');
  }
}

// Show available spaces
async function showAvailableSpaces(to, spaceType, cityId) {
  try {
    const city = cityId.replace(/_/g, ' ');
    const assets = await Asset.find({
      type: spaceType,
      'location.city': new RegExp(city, 'i'),
      status: 'approved',
      isActive: true
    }).limit(10).populate('partner', 'name profile.businessName');
    
    if (assets.length === 0) {
      await sendWhatsAppMessage(to, '❌ No spaces available in this city. Type "book" to search again.');
      return;
    }
    
    const rows = assets.map(asset => {
      const price = asset.pricing.hourly 
        ? `₹${asset.pricing.hourly}/hr`
        : asset.pricing.daily 
        ? `₹${asset.pricing.daily}/day`
        : 'Price on request';
      
      return {
        id: asset._id.toString(),
        title: asset.title.substring(0, 24),
        description: `${price} | ${asset.location.city}`
      };
    });
    
    await sendListMessage(
      to,
      `Found ${assets.length} available spaces!`,
      'Select Space',
      [{ title: 'Available Spaces', rows }]
    );
  } catch (error) {
    console.error('❌ Error fetching spaces:', error);
    await sendWhatsAppMessage(to, '❌ Error loading spaces. Please try again.');
  }
}

// Show booking options
async function showBookingOptions(to, assetId) {
  try {
    const asset = await Asset.findById(assetId);
    if (!asset) {
      await sendWhatsAppMessage(to, '❌ Space not found. Type "book" to start over.');
      return;
    }
    
    const buttons = [];
    if (asset.pricing.hourly) buttons.push({ id: 'hourly', title: `Hourly ₹${asset.pricing.hourly}` });
    if (asset.pricing.daily) buttons.push({ id: 'daily', title: `Daily ₹${asset.pricing.daily}` });
    if (asset.pricing.monthly && buttons.length < 3) buttons.push({ id: 'monthly', title: `Monthly ₹${asset.pricing.monthly}` });
    
    if (buttons.length === 0) {
      await sendWhatsAppMessage(to, '❌ No pricing available. Please contact us directly.');
      return;
    }
    
    await sendInteractiveButtons(
      to,
      `📍 ${asset.title}\n\n${asset.location.address}, ${asset.location.city}\n👥 Capacity: ${asset.capacity}\n\nSelect booking duration:`,
      buttons
    );
  } catch (error) {
    console.error('❌ Error showing booking options:', error);
    await sendWhatsAppMessage(to, '❌ Error loading details. Please try again.');
  }
}

// Request date and time
async function requestDateTime(to) {
  await sendWhatsAppMessage(
    to,
    '📅 Please enter your preferred date (format: DD/MM/YYYY)\nExample: 25/12/2024'
  );
}

async function requestTime(to) {
  await sendWhatsAppMessage(
    to,
    '⏰ Please enter your preferred time (format: HH:MM)\nExample: 14:30'
  );
}

async function requestContactInfo(to) {
  await sendWhatsAppMessage(to, '👤 Please enter your full name:');
}

async function requestEmail(to) {
  await sendWhatsAppMessage(to, '📧 Please enter your email address:');
}

// Show user's bookings
async function showMyBookings(to) {
  try {
    const bookings = await Booking.find({ 'customer.phone': to })
      .populate('asset')
      .sort({ createdAt: -1 })
      .limit(5);
    
    if (bookings.length === 0) {
      await sendWhatsAppMessage(to, '📋 You have no bookings yet. Type "book" to make your first booking!');
      return;
    }
    
    let message = '📋 Your Recent Bookings:\n\n';
    bookings.forEach((booking, index) => {
      message += `${index + 1}. ${booking.asset.title}\n`;
      message += `   🆔 ID: ${booking.bookingId}\n`;
      message += `   📅 Date: ${booking.bookingDetails.date} at ${booking.bookingDetails.time}\n`;
      message += `   📊 Status: ${booking.status}\n`;
      message += `   💰 Amount: ₹${booking.pricing.totalAmount}\n\n`;
    });
    
    await sendWhatsAppMessage(to, message);
  } catch (error) {
    console.error('❌ Error fetching bookings:', error);
    await sendWhatsAppMessage(to, '❌ Error loading your bookings.');
  }
}

// Confirm booking
async function confirmBooking(to, state) {
  try {
    const asset = await Asset.findById(state.assetId);
    
    if (!asset) {
      throw new Error('Asset not found');
    }
    
    const pricing = {
      hourly: asset.pricing.hourly,
      daily: asset.pricing.daily,
      monthly: asset.pricing.monthly
    };
    
    const amount = pricing[state.duration] || 0;
    const tax = Math.round(amount * 0.18); // 18% GST
    const total = amount + tax;
    
    const summary = `📋 Booking Summary\n\n` +
      `📍 Space: ${asset.title}\n` +
      `🏙️ Location: ${asset.location.city}\n` +
      `📅 Date: ${state.date}\n` +
      `⏰ Time: ${state.time}\n` +
      `⏳ Duration: ${state.duration}\n\n` +
      `💰 Base: ₹${amount}\n` +
      `🧾 Tax (18%): ₹${tax}\n` +
      `💳 Total: ₹${total}\n\n` +
      `👤 Name: ${state.name}\n` +
      `📧 Email: ${state.email}\n\n` +
      `Please confirm your booking:`;
    
    state.amount = amount;
    state.tax = tax;
    state.total = total;
    conversationStates.set(to, state);
    
    await sendInteractiveButtons(
      to,
      summary,
      [
        { id: 'confirm_booking', title: '✅ Confirm' },
        { id: 'cancel_booking', title: '❌ Cancel' }
      ]
    );
  } catch (error) {
    console.error('❌ Error confirming booking:', error);
    await sendWhatsAppMessage(to, '❌ Error creating booking summary. Please try again.');
  }
}

// Process booking
async function processBooking(to, state) {
  try {
    console.log('🔄 Processing booking with state:', JSON.stringify(state, null, 2));
    
    const asset = await Asset.findById(state.assetId);
    
    if (!asset) {
      throw new Error(`Asset not found: ${state.assetId}`);
    }
    
    const bookingId = generateBookingId();
    
    const bookingData = {
      bookingId: bookingId,
      asset: asset._id,
      partner: asset.partner,
      customer: {
        name: state.name,
        email: state.email,
        phone: to
      },
      bookingDetails: {
        date: state.date,
        time: state.time,
        duration: state.duration,
        numberOfUnits: 1
      },
      pricing: {
        baseAmount: state.amount,
        tax: state.tax,
        totalAmount: state.total,
        currency: 'INR'
      },
      source: 'whatsapp',
      status: 'confirmed',
      paymentStatus: 'pending'
    };
    
    console.log('📝 Creating booking with data:', JSON.stringify(bookingData, null, 2));
    
    const booking = new Booking(bookingData);
    await booking.save();
    
    console.log('✅ Booking saved successfully:', booking.bookingId);
    
    // Send confirmation message
    const confirmationMessage = 
      `✅ Booking Confirmed!\n\n` +
      `🆔 Booking ID: ${booking.bookingId}\n` +
      `📍 Space: ${asset.title}\n` +
      `🏙️ Location: ${asset.location.address}, ${asset.location.city}\n` +
      `📅 Date: ${state.date}\n` +
      `⏰ Time: ${state.time}\n` +
      `⏳ Duration: ${state.duration}\n` +
      `💰 Total: ₹${state.total}\n\n` +
      `📧 A confirmation email has been sent to ${state.email}\n\n` +
      `Thank you for choosing Innerspace! 🎉\n\n` +
      `Type "book" to make another booking or "my_bookings" to view your bookings.`;
    
    await sendWhatsAppMessage(to, confirmationMessage);
    
    // Log success
    console.log(`✅ Booking ${bookingId} confirmed for ${state.name} (${state.email})`);
    
  } catch (error) {
    console.error('❌ Booking processing error:', error.message);
    console.error('Full error:', error);
    console.error('State at error:', JSON.stringify(state, null, 2));
    
    await sendWhatsAppMessage(
      to, 
      `❌ Error processing booking: ${error.message}\n\nPlease try again or contact support.`
    );
  }
}

// Validation helpers
function isValidDate(dateStr) {
  const regex = /^\d{2}\/\d{2}\/\d{4}$/;
  if (!regex.test(dateStr)) return false;
  
  const [day, month, year] = dateStr.split('/').map(Number);
  const date = new Date(year, month - 1, day);
  
  return date.getFullYear() === year && 
         date.getMonth() === month - 1 && 
         date.getDate() === day &&
         date >= new Date();
}

function isValidTime(timeStr) {
  const regex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return regex.test(timeStr);
}

function isValidEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

module.exports = router;
