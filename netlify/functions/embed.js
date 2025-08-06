const { Configuration, OpenAIApi } = require("openai");
const cfg = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const ai = new OpenAIApi(cfg);

exports.handler = async ({ body }) => {
  try {
    const { input, model } = JSON.parse(body);
    const res = await ai.createEmbedding({
      model: model || "text-embedding-3-small",
      input
    });
    return { statusCode: 200, body: JSON.stringify(res.data) };
  } catch(err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
