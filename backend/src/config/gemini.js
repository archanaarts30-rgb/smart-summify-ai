const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// gemini-2.0-flash is the stable fast model available to all API keys.
// Switch to 'gemini-2.5-flash' once your key has access to that preview model.
const getModel = () => genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

module.exports = { getModel };
