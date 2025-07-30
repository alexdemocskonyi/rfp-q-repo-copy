const fetch = require('node-fetch');
exports.handler = async (event) => {
  try {
    console.log("🔹 Received event:", event.body);
    console.log("🔹 API Key exists:", !!process.env.OPENAI_API_KEY);
    const { model, messages } = JSON.parse(event.body);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model, messages })
    });
    const text = await response.text();
    console.log("🔹 OpenAI raw response:", text);
    return { statusCode: response.status, body: text };
  } catch (err) {
    console.error("❌ Proxy function error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
