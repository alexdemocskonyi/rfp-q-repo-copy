const fetch = require("node-fetch");

exports.handler = async (event) => {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Missing key" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Bad JSON" }) };
  }
  const { input } = body;
  if (!input || typeof input !== "string") {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing input" }) };
  }

  try {
    const resp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: \`Bearer \${OPENAI_KEY}\`,
      },
      body: JSON.stringify({ model: "text-embedding-3-small", input }),
    });
    if (!resp.ok) {
      const errJson = await resp.json();
      return { statusCode: resp.status, body: JSON.stringify(errJson) };
    }
    const j = await resp.json();
    return { statusCode: 200, body: JSON.stringify({ embedding: j.data[0].embedding }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
