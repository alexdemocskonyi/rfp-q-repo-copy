/* RFP RAG search + chat (clean build) */
let data = [];
let fuse;

function cosineSimilarity(a, b) {
  let dot=0, ma=0, mb=0;
  const n = Math.min(a?.length||0, b?.length||0);
  for (let i=0;i<n;i++){ const x=a[i], y=b[i]; dot+=x*y; ma+=x*x; mb+=y*y; }
  return (ma && mb) ? (dot / Math.sqrt(ma*mb)) : 0;
}

async function loadData() {
  if (data.length) return;
  const res = await fetch("rfp_data_with_local_embeddings.json?t="+Date.now());
  data = await res.json();
  window.data = data;
  fuse = new Fuse(data, { includeScore:true, threshold:0.35, keys:["question"] });
  window.fuse = fuse;
  console.log("✅ Loaded", data.length, "records");
}

function firstAnswer(it){
  if (!it) return null;
  const a = it.answers;
  if (Array.isArray(a)) return String(a[0] ?? "").trim() || null;
  return String(a ?? "").trim() || null;
}

function strongEnough(s){
  if (!s) return false;
  const txt = String(s).trim();
  if (!txt) return false;
  const idk = /\b(i\s*(do\s*not|don[’']?t)\s*know|unknown|not\s*sure|no\s*(idea|information)|cannot\s*(answer|determine))\b/i;
  if (idk.test(txt)) return false;
  if (txt.length >= 24) return true;
  if (/[0-9%]/.test(txt)) return true;            // numeric facts often short
  if (/^(yes|no)\b/i.test(txt) && txt.length>=10) return true;
  return false;
}

function rankFromLexical(q){
  const ql = q.toLowerCase();
  return data.filter(d => (d.question||"").toLowerCase().includes(ql));
}

function rankFromFuzzy(q){
  if (!fuse) return [];
  return fuse.search(q, { limit: 20 }).map(r => r.item);
}

function rankFromEmbeddings(qemb){
  if (!qemb) return [];
  return data
    .map(d => ({ item:d, score: cosineSimilarity(qemb, d.embedding||[]) }))
    .filter(x => x.score > 0.28)
    .sort((a,b)=> b.score - a.score)
    .map(x => x.item);
}

function dedupeKeepOrder(list){
  const seen = new Set();
  const out = [];
  for (const it of list){
    const k = (it.question||"") + "::" + firstAnswer(it);
    if (!seen.has(k)) { seen.add(k); out.push(it); }
  }
  return out;
}

async function embedQuery(q){
  try{
    const r = await fetch("/.netlify/functions/embed",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ input:q, model:"text-embedding-3-small" })
    });
    const j = await r.json();
    return (j?.data?.[0]?.embedding) || null;
  }catch(e){ console.warn("embed fail", e); return null; }
}

function buildContext(ranked, maxChars=1800){
  let out = "";
  for (const it of ranked.slice(0,8)){
    const ans = firstAnswer(it) || "";
    const chunk = `Q: ${it.question}\nA: ${ans}\n\n`;
    if ((out.length + chunk.length) > maxChars) break;
    out += chunk;
  }
  return out || "(no context)";
}

/* ---------- UI: grouped results w/ show more ---------- */
function renderGrouped(groups, container) {
  container.innerHTML = "";
  const buckets = [
    { title: "🔍 Direct Matches", items: groups.direct },
    { title: "✏️ Fuzzy Matches",  items: groups.fuzzy  },
    { title: "🤖 Contextual Matches", items: groups.context }
  ];
  for (const b of buckets) {
    if (!b.items?.length) continue;
    const section = document.createElement("section");
    section.innerHTML = `<h3 style="margin:12px 0">${b.title}</h3>`;
    const list = document.createElement("div");
    list.className = "bucket-list";
    const renderList = (take) => {
      list.innerHTML = "";
      b.items.slice(0, take).forEach(it => {
        const card = document.createElement("div");
        card.className = "card";
        card.style.cssText = "padding:8px;margin:6px 0;border:1px solid #ddd;border-radius:6px;";
        card.innerHTML = `<strong>Q:</strong> ${it.question}<br><em>A:</em> ${firstAnswer(it) || ""}`;
        list.appendChild(card);
      });
    };
    let expanded=false;
    renderList(Math.min(3, b.items.length));
    section.appendChild(list);
    if (b.items.length > 3) {
      const toggle = document.createElement("button");
      toggle.textContent = "Show more";
      toggle.style.cssText = "margin:4px 0;padding:6px 10px;cursor:pointer;";
      toggle.addEventListener("click", ()=>{
        expanded = !expanded;
        toggle.textContent = expanded ? "Show less" : "Show more";
        renderList(expanded ? b.items.length : 3);
      });
      section.appendChild(toggle);
    }
    container.appendChild(section);
  }
}

/* ---------- General search ---------- */
async function generalSearch(){
  await loadData();
  const box = document.querySelector("#search-box");
  const out = document.querySelector("#results");
  const q = (box?.value || "").trim();
  if (!q || q.length < 3){ if (out) out.innerHTML=""; return; }

  const direct = rankFromLexical(q);
  const fuzzy  = rankFromFuzzy(q);

  let context = [];
  try{
    const qemb = await embedQuery(q);
    context = rankFromEmbeddings(qemb);
  }catch(e){ console.warn("context fail", e); }

  if (out) renderGrouped({ direct, fuzzy, context }, out);
}

/* ---------- Chat (RAG) ---------- */
async function handleChat(){
  await loadData();
  const inp = document.querySelector("#chat-input");
  const out = document.querySelector("#chatbot-response");
  const q = (inp?.value || "").trim();
  if (!out) return;
  if (!q){ out.textContent = "Please type a question."; return; }
  out.textContent = "…thinking…";

  // Rank
  const direct = rankFromLexical(q);
  const fuzzy  = rankFromFuzzy(q);
  const qemb   = await embedQuery(q);
  const embedR = rankFromEmbeddings(qemb);
  const ranked = dedupeKeepOrder([...direct, ...fuzzy, ...embedR]);

  // Build context
  const ctx = buildContext(ranked);

  // Ask model
  let answer = "";
  try{
    const sys = [
      "You answer ONLY using the provided context (Q/A pairs from our RFP dataset).",
      "Be concise (1–3 sentences).",
      "If the answer is not in the context, reply exactly: NO MATCH."
    ].join(" ");
    const r = await fetch("/.netlify/functions/proxy", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        model:"gpt-4o-mini",
        messages:[
          { role:"system", content: sys },
          { role:"user",   content: `CONTEXT:\n${ctx}\n\nQUESTION: ${q}\n\nANSWER:`}
        ]
      })
    });
    const j = await r.json();
    answer = j?.choices?.[0]?.message?.content || "";
  }catch(e){ console.warn("chat fail", e); }

  // Fall back to DB best only if truly weak
  if (!strongEnough(answer) || /^no match$/i.test(answer)){
    const best = firstAnswer(ranked[0]) || firstAnswer(fuzzy[0]) || firstAnswer(direct[0]);
    answer = best || "No exact answer in the dataset.";
  }

  out.textContent = answer;
}

/* ---------- Wire up ---------- */
window.addEventListener("DOMContentLoaded", () => {
  const sBtn = document.querySelector("#search-button");
  if (sBtn) sBtn.addEventListener("click", generalSearch);
  const cBtn = document.querySelector("#chat-button");
  if (cBtn) cBtn.addEventListener("click", handleChat);
  const cIn  = document.querySelector("#chat-input");
  if (cIn) cIn.addEventListener("keydown", e=>{ if(e.key==="Enter") handleChat(); });
});

/* Expose for console debugging */
window._rfp = { loadData, generalSearch, handleChat };
/* === RFP Chat Hard Override (RAG v4) === */
(() => {
  // Always replace chat with this version
  const CHAT_URL = "/.netlify/functions/proxy";
  const EMBED_URL = "/.netlify/functions/embed";
  const ALWAYS_DB_FALLBACK = true; // <- never say IDK; use best dataset answer

  const IDK = /\b(i\s*(do\s*not|don['’]t)\s*know|no\s*match|no exact answer|not\s*sure|cannot\s*(answer|determine))\b/i;
  const tooShort = s => !s || String(s).trim().length < 18;
  const weak = s => tooShort(s) || IDK.test(String(s));

  const firstAnswer = (it) => {
    if (!it) return null;
    if (Array.isArray(it.answers)) return it.answers.find(a => a && a.trim()) || null;
    return it.answers || null;
  };

  async function ensureData() {
    if (typeof window.loadData === "function") { try { await window.loadData(); } catch(_){} }
    const d = Array.isArray(window.data) ? window.data : [];
    if (!window.fuse && d.length) {
      try { window.fuse = new Fuse(d, { includeScore:true, threshold:0.38, ignoreLocation:true, keys:["question","answers"] }); } catch {}
    }
    return d;
  }

  function cosine(a,b){
    let dot=0,ma=0,mb=0;
    const n = Math.min(a?.length||0,b?.length||0);
    for (let i=0;i<n;i++){ const x=a[i], y=b[i]; dot+=x*y; ma+=x*x; mb+=y*y; }
    const denom = Math.sqrt(ma)*Math.sqrt(mb) || 1;
    return dot/denom;
  }

  async function embedQuery(q){
    try{
      const r = await fetch(EMBED_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({input:q,model:"text-embedding-3-small"})});
      const j = await r.json();
      return j?.data?.[0]?.embedding || null;
    }catch{ return null; }
  }

  function rankLex(q, data){
    const ql = q.toLowerCase();
    return data.map(it => {
      let s = 0;
      if ((it.question||"").toLowerCase().includes(ql)) s += 1;
      const a = (firstAnswer(it)||"").toLowerCase();
      if (a.includes(ql)) s += 0.5;
      return { item: it, s };
    }).filter(x=>x.s>0).sort((a,b)=>b.s-a.s);
  }

  function rankFuzzy(q){
    const f = window.fuse;
    if (!f) return [];
    return f.search(q).map(r => ({ item:r.item, s: 1 - Math.min(1, r.score||1) }));
  }

  function rankEmbed(qemb, data){
    if (!qemb) return [];
    const arr = [];
    for (const it of data){
      const e = it.embedding;
      if (!Array.isArray(e) || e.length !== qemb.length) continue;
      arr.push({ item: it, s: Math.max(0, cosine(qemb, e)) });
    }
    arr.sort((a,b)=>b.s-a.s);
    return arr;
  }

  function dedupeKeepBest(items){
    const seen = new Map();
    for (const {item,s} of items){
      const key = item.question || JSON.stringify(item).slice(0,180);
      if (!seen.has(key) || s>seen.get(key).s) seen.set(key,{item,s});
    }
    return [...seen.values()].sort((a,b)=>b.s-a.s);
  }

  function buildContext(ranked, take=10, maxChars=8000){
    let out = "";
    for (let i=0; i<ranked.length && i<take; i++){
      const it = ranked[i].item || ranked[i];
      const q  = it.question || "";
      const a  = firstAnswer(it) || "";
      const chunk = `Q${i+1}: ${q}\nA${i+1}: ${a}\n\n`;
      if (out.length + chunk.length > maxChars) break;
      out += chunk;
    }
    return out || "(no context)";
  }

  function pickBest(ranked, fuzzy, lex){
    return firstAnswer(ranked?.[0]?.item) || firstAnswer(fuzzy?.[0]?.item) || firstAnswer(lex?.[0]?.item) || null;
  }

  window.handleChat = async function(){
    const inputEl = document.querySelector("#chat-input");
    const outEl   = document.querySelector("#chatbot-response") || document.querySelector(".chat-output") || document.querySelector("#chat-response");
    const q = (inputEl?.value || "").trim();
    if (!q){ if (outEl) outEl.textContent = "Type a question."; return; }
    if (outEl) outEl.textContent = "…thinking…";

    const data = await ensureData();
    const lex  = rankLex(q, data);
    const fuzzy= rankFuzzy(q);
    const qemb = await embedQuery(q);
    const emb  = rankEmbed(qemb, data);
    const pool = dedupeKeepBest([ ...emb, ...fuzzy, ...lex ]);
    const ctx  = buildContext(pool, 10, 8000);

    let ans = "";
    try{
      const sys = "You are an RFP assistant. Answer in 1–3 sentences using ONLY the provided context of Q/A pairs. Prefer precise, factual sentences taken from the context.";
      const r = await fetch(CHAT_URL, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"gpt-4o-mini",
          messages:[
            { role:"system", content: sys },
            { role:"user",   content: `CONTEXT:\n${ctx}\n\nQUESTION: ${q}\n\nAnswer strictly from the context.`}
          ]
        })
      });
      const j = await r.json();
      ans = j?.choices?.[0]?.message?.content || "";
    }catch(e){ /* swallow and fallback below */ }

    if (ALWAYS_DB_FALLBACK || weak(ans)){
      const best = pickBest(pool, fuzzy, lex);
      if (best) ans = best;
      else if (!ans) ans = "No exact answer in the dataset.";
    }

    if (outEl) outEl.textContent = ans;
  };

  const btn = document.querySelector("#chat-button") || document.querySelector("button#ask-ai") || document.querySelector("button.ask-ai");
  if (btn) btn.onclick = () => window.handleChat();
  const cin = document.querySelector("#chat-input") || document.querySelector('input[name="chat"]') || document.querySelector('input[placeholder*="Ask"]');
  if (cin) cin.addEventListener("keydown", e => { if (e.key === "Enter") window.handleChat(); });

  console.log("[RFP RAG v4] chat override active");
})();
/* === Chat: RAG when possible, model-only when not (with DB fallback) === */
(() => {
  const CHAT_URL  = "/.netlify/functions/proxy";
  const EMBED_URL = "/.netlify/functions/embed";

  const IDK = /\b(i\s*(do\s*not|don[’']?t)\s*know|no\s*match|not\s*sure|cannot\s*(answer|determine))\b/i;
  const tooShort = s => !s || String(s).trim().length < 18;
  const weak = s => tooShort(s) || IDK.test(String(s||""));

  const firstAnswer = (it) => {
    if (!it) return null;
    if (Array.isArray(it.answers)) return it.answers.find(a => a && a.trim()) || null;
    return it.answers || null;
  };

  async function ensureData(){
    if (typeof window.loadData === "function") { try { await window.loadData(); } catch(_){} }
    const d = Array.isArray(window.data) ? window.data : [];
    if (!window.fuse && d.length){
      try {
        window.fuse = new Fuse(d, { includeScore:true, threshold:0.38, ignoreLocation:true, keys:["question","answers"] });
      } catch {}
    }
    return d;
  }

  function cosine(a,b){
    let dot=0,ma=0,mb=0;
    const n=Math.min(a?.length||0,b?.length||0);
    for (let i=0;i<n;i++){ const x=a[i], y=b[i]; dot+=x*y; ma+=x*x; mb+=y*y; }
    const denom = Math.sqrt(ma)*Math.sqrt(mb) || 1;
    return dot/denom;
  }

  async function embedQuery(q){
    try{
      const r = await fetch(EMBED_URL, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ input:q, model:"text-embedding-3-small" }) });
      const j = await r.json();
      return j?.data?.[0]?.embedding || null;
    }catch{ return null; }
  }

  function rankLex(q, data){
    const ql = q.toLowerCase();
    return data.map(it=>{
      let s=0;
      if ((it.question||"").toLowerCase().includes(ql)) s+=1;
      if ((firstAnswer(it)||"").toLowerCase().includes(ql)) s+=0.5;
      return { item:it, s };
    }).filter(x=>x.s>0).sort((a,b)=>b.s-a.s);
  }

  function rankFuzzy(q){
    const f = window.fuse;
    if (!f) return [];
    return f.search(q).map(r=>({ item:r.item, s:1 - Math.min(1, r.score||1) }));
  }

  function rankEmbed(qemb, data){
    if (!qemb) return [];
    const arr=[];
    for (const it of data){
      const e=it.embedding;
      if (!Array.isArray(e) || e.length!==qemb.length) continue;
      arr.push({ item:it, s: Math.max(0, cosine(qemb,e)) });
    }
    arr.sort((a,b)=>b.s-a.s);
    return arr;
  }

  function dedupeKeepBest(items){
    const seen=new Map();
    for (const {item,s} of items){
      const key=item.question || JSON.stringify(item).slice(0,180);
      if (!seen.has(key) || s>seen.get(key).s) seen.set(key,{item,s});
    }
    return [...seen.values()].sort((a,b)=>b.s-a.s);
  }

  function buildContext(ranked, take=10, maxChars=8000){
    let out="";
    for (let i=0;i<ranked.length && i<take;i++){
      const it=ranked[i].item || ranked[i];
      const q=it.question||"";
      const a=firstAnswer(it)||"";
      const chunk=`Q${i+1}: ${q}\nA${i+1}: ${a}\n\n`;
      if (out.length+chunk.length>maxChars) break;
      out+=chunk;
    }
    return out;
  }

  function bestFromDb(q){
    try{
      const f = window.fuse;
      const hit = f ? f.search(q,{limit:1})?.[0]?.item : null;
      return firstAnswer(hit);
    }catch{ return null; }
  }

  window.handleChat = async function(){
    const inputEl = document.querySelector("#chat-input") || document.querySelector('input[name="chat"]');
    const outEl   = document.querySelector("#chatbot-response") || document.querySelector(".chat-output") || document.querySelector("#chat-response");
    const q = (inputEl?.value || "").trim();
    if (!q){ if(outEl) outEl.textContent="Type a question."; return; }
    if (outEl) outEl.textContent = "…thinking…";

    const data = await ensureData();

    // Try to build dataset context (RAG)
    let ctx = "";
    let pool = [];
    if (data.length){
      const lex  = rankLex(q, data);
      const fuzzy= rankFuzzy(q);
      const qemb = await embedQuery(q);
      const emb  = rankEmbed(qemb, data);
      pool = dedupeKeepBest([...emb, ...fuzzy, ...lex]);
      ctx = buildContext(pool, 10, 8000);
    }

    // Ask model – if we have context, force using it; otherwise answer generally
    let ans="";
    try{
      const sys = pool.length
        ? "You are an RFP assistant. Answer in 1–3 sentences using ONLY the provided context (RFP Q/A pairs). Be precise."
        : "You are a helpful assistant. Answer directly even without RFP context.";
      const user = pool.length
        ? `CONTEXT:\n${ctx}\n\nQUESTION: ${q}\n\nAnswer strictly from the context.`
        : q;

      const r = await fetch(CHAT_URL, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"gpt-4o-mini", messages:[{role:"system",content:sys},{role:"user",content:user}] })
      });
      const j = await r.json();
      ans = j?.choices?.[0]?.message?.content || "";
    }catch{ /* ignore, we’ll fallback */ }

    // If the model reply is weak and we DO have a dataset, show best DB answer
    if (pool.length && weak(ans)){
      const best = bestFromDb(q);
      if (best) ans = best;
    }

    outEl && (outEl.textContent = ans || "Sorry, I couldn’t generate an answer.");
  };

  const btn = document.querySelector("#chat-button") || document.querySelector("button#ask-ai") || document.querySelector("button.ask-ai");
  if (btn) btn.onclick = ()=>window.handleChat();
  const cin = document.querySelector("#chat-input") || document.querySelector('input[name="chat"]');
  if (cin) cin.addEventListener("keydown", e=>{ if (e.key==="Enter") window.handleChat(); });

  console.log("[chat] RAG+general fallback active");
})();
