const fetch = require("node-fetch");
exports.handler = async ({ body }) => {
  try {
    const { model, messages } = JSON.parse(body);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({ model, messages })
    });
    const text = await res.text();
    return { statusCode: res.status, body: text };
  } catch(err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
