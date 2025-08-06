// netlify/functions/embed.js
const { Configuration, OpenAIApi } = require("openai");
const config = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(config);

exports.handler = async (event) => {
  try {
    const { input, model } = JSON.parse(event.body);
    const response = await openai.createEmbedding({
      model: model || "text-embedding-3-small",
      input,
    });
    return {
      statusCode: 200,
      body: JSON.stringify(response.data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
