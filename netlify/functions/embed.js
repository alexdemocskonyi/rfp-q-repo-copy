const OpenAI = require("openai");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

exports.handler = async (event) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: "Missing OPENAI_API_KEY" }) };
    }
    const body = JSON.parse(event.body || "{}");
    const input = body.input ?? "";
    const model = body.model || "text-embedding-3-small";
    if (!input || (Array.isArray(input) && input.length === 0)) {
      return { statusCode: 400, body: JSON.stringify({ error: "input required" }) };
    }
    const resp = await client.embeddings.create({ model, input });
    return { statusCode: 200, body: JSON.stringify(resp) };
  } catch (err) {
    console.error("embed error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "server error" }) };
  }
};
