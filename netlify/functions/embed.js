exports.handler = async function (event, context) {
  return {
    statusCode: 501,
    body: JSON.stringify({ error: "OpenAI embedding not implemented in local mode" })
  };
};
