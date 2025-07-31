const fetch = require('node-fetch');
exports.handler = async () => {
  try {
    const url = "https://populationhealthsolutions-my.sharepoint.com/personal/alex_democskonyi_uprisehealth_com/_layouts/15/download.aspx?UniqueId=5def977895fb4f759f609b214f1a037e&e=J49Kfg";
    const res = await fetch(url);
    const text = await res.text();
    try {
      // Try parsing directly
      const json = JSON.parse(text);
      return { statusCode: 200, body: JSON.stringify(json) };
    } catch {
      // If OneDrive wraps the JSON, try cleanup
      const cleaned = text.replace(/^[^\[]*/, "").replace(/[^}]*$/, "");
      const json = JSON.parse(cleaned);
      return { statusCode: 200, body: JSON.stringify(json) };
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
