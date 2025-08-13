"use strict";
const { getStore } = require("@netlify/blobs");
const H = { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" };
const ok = (b)=>({statusCode:200,headers:H,body:JSON.stringify(b)});
const err=(c,m)=>({statusCode:c,headers:H,body:JSON.stringify({error:m})});
exports.handler = async (event) => {
  try{
    const sec = event.headers["x-edit-secret"] || event.headers["X-Edit-Secret"];
    if (sec !== process.env.EDITS_SECRET) return err(401,"unauthorized");
    if (event.httpMethod !== "POST") return { statusCode:405, headers:{...H,Allow:"POST"}, body:JSON.stringify({error:"method not allowed"}) };
    const body = JSON.parse(event.body||"{}");
    const key = body.key; const data = body.data ?? {};
    if (!key) return err(400,"missing key");
    const store = getStore("rfp-edits");
    await store.set(key, JSON.stringify(data), { contentType:"application/json" });
    return ok({ ok:true, key });
  }catch(e){ return err(500, String(e.message||e)); }
};
