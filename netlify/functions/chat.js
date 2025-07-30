exports.handler = async (event) => {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    return { statusCode: 500, body: JSON.stringify({ advice: "" }) };
  }
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ advice: "" }) };
  }
  const { prompt } = body;
  if (!prompt) {
    return { statusCode: 400, body: JSON.stringify({ advice: "" }) };
  }
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: \`Bearer \${OPENAI_KEY}\`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150
      })
    });
    const j = await resp.json();
    const advice = j.choices?.[0]?.message?.content || "";
    return { statusCode: 200, body: JSON.stringify({ advice }) };
  } catch {
    return { statusCode: 500, body: JSON.stringify({ advice: "" }) };
  }
};
