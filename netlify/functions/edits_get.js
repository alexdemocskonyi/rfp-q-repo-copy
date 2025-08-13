"use strict";
const { getStore } = require("@netlify/blobs");
const H = { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" };
const ok = (b)=>({statusCode:200,headers:H,body:JSON.stringify(b)});
const err=(c,m)=>({statusCode:c,headers:H,body:JSON.stringify({error:m})});
exports.handler = async (event) => {
  try{
    const sec = event.headers["x-edit-secret"] || event.headers["X-Edit-Secret"];
    if (sec !== process.env.EDITS_SECRET) return err(401,"unauthorized");
    const key = (event.queryStringParameters||{}).key;
    if (!key) return err(400,"missing key");
    const store = getStore("rfp-edits");
    const val = await store.get(key, { type:"json" });
    if (val == null) return err(404,"not found");
    return ok({ key, data: val });
  }catch(e){ return err(500, String(e.message||e)); }
};
