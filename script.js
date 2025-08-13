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
