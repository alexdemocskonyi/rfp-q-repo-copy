const OpenAI = require("openai");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const messages = Array.isArray(body.messages)
      ? body.messages
      : [{ role: "user", content: String(body.input || "") }];
    const model = body.model || "gpt-4o-mini";
    const resp = await client.chat.completions.create({ model, messages });
    return { statusCode: 200, headers: {"Content-Type":"application/json"}, body: JSON.stringify(resp) };
  } catch (err) {
    return { statusCode: 500, headers: {"Content-Type":"application/json"}, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
