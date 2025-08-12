const OpenAI = require("openai");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

exports.handler = async (event) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: "Missing OPENAI_API_KEY" }) };
    }
    const body = JSON.parse(event.body || "{}");
    const messages = Array.isArray(body.messages)
      ? body.messages
      : [{ role: "user", content: String(body.input || "") }];
    const model = body.model || "gpt-4o-mini";

    const resp = await client.chat.completions.create({ model, messages });
    return { statusCode: 200, body: JSON.stringify(resp) };
  } catch (err) {
    console.error("proxy error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "server error" }) };
  }
};
