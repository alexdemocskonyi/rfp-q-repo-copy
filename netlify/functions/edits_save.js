// saves a suggested Q/A (auth with EDITS_SECRET)
const { getStore } = require('@netlify/blobs');
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode:405, body:'Method Not Allowed' };
    const sec = process.env.EDITS_SECRET;
    if (!sec || event.headers['x-edits-secret'] !== sec) return { statusCode:401, body:'Unauthorized' };
    const body = JSON.parse(event.body||'{}');
    if (!body.question || !body.answer) return { statusCode:400, body:'Missing question/answer' };
    const store = getStore('rfp-edits');
    const arr = await store.get('pending.json', { type:'json' }) || [];
    arr.push({ question: body.question, answers:[body.answer], at: Date.now() });
    await store.set('pending.json', JSON.stringify(arr));
    return { statusCode:200, body: JSON.stringify({ ok:true, count: arr.length }) };
  } catch(e){ return { statusCode:500, body: JSON.stringify({ error: e.message })}; }
};
