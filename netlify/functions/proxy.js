// netlify/functions/proxy.js
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

exports.handler = async (event) => {
  try {
    const { model, messages } = JSON.parse(event.body);
    const response = await openai.createChatCompletion({
      model: model || "gpt-4o",
      messages,
    });
    return {
      statusCode: 200,
      body: JSON.stringify(response.data),
    };
  } catch (err) {
    return {
      statusCode: err.status || 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
