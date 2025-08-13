// returns array of pending edits
const { getStore } = require('@netlify/blobs');
exports.handler = async () => {
  const store = getStore('rfp-edits');
  const arr = await store.get('pending.json', { type:'json' }) || [];
  return { statusCode: 200, body: JSON.stringify(arr) };
};
