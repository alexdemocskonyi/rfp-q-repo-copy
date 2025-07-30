const fetch = require('node-fetch');
exports.handler = async (event) => {
  try {
    const { model, messages } = JSON.parse(event.body);
    if (!process.env.OPENAI_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: "API key missing" }) };
    }
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages })
    });
    const data = await response.json();
    return { statusCode: response.status, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
