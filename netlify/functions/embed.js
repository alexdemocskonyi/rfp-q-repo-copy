const OpenAI = require("openai");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const input = body.input ?? "";
    const model = body.model || "text-embedding-3-small";
    const resp = await client.embeddings.create({ model, input });
    return { statusCode: 200, headers: {"Content-Type":"application/json"}, body: JSON.stringify(resp) };
  } catch (err) {
    return { statusCode: 500, headers: {"Content-Type":"application/json"}, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
