let data = [], fuse;

// cosine similarity helper
function cosineSimilarity(a,b){
  let dot=0, magA=0, magB=0;
  for(let i=0;i<a.length;i++){
    dot += a[i]*b[i];
    magA += a[i]*a[i];
    magB += b[i]*b[i];
  }
  return dot/(Math.sqrt(magA)*Math.sqrt(magB));
}

// load dataset + init Fuse
async function loadData(){
  if(data.length) return;
  console.log("🔄 Fetching dataset…");
  const r = await fetch("rfp_data_with_local_embeddings.json?t="+Date.now());
  data = await r.json();
  console.log(`✅ Loaded ${data.length} records`);
  fuse = new Fuse(data, { keys:["question"], includeScore:true, threshold:0.4 });
}

// render grouped results
function renderGrouped({direct,fuzzy,context}, out){
  out.innerHTML="";
  const buckets = [
    ["🔍 Direct Matches", direct],
    ["✏️ Fuzzy Matches", fuzzy],
    ["🤖 Contextual Matches", context]
  ];
  buckets.forEach(([title,items])=>{
    if(!items.length) return;
    const sec = document.createElement("div");
    sec.innerHTML = `<h3>${title}</h3>`;
    const list = document.createElement("div");
    list.className="bucket-list";
    items.slice(0,3).forEach(d=>{
      const c = document.createElement("div");
      c.className="card";
      c.innerHTML = `<strong>Q:</strong> ${d.question}<br><em>A:</em> ${d.answers[0]}`;
      list.appendChild(c);
    });
    sec.appendChild(list);
    if(items.length>3){
      const btn = document.createElement("button");
      let expanded=false;
      btn.textContent="Show more";
      btn.onclick = ()=>{
        expanded = !expanded;
        list.innerHTML="";
        items.slice(0, expanded?items.length:3)
             .forEach(d=>{
               const c=document.createElement("div");
               c.className="card";
               c.innerHTML=`<strong>Q:</strong> ${d.question}<br><em>A:</em> ${d.answers[0]}`;
               list.appendChild(c);
             });
        btn.textContent = expanded?"Show less":"Show more";
      };
      sec.appendChild(btn);
    }
    out.appendChild(sec);
  });
}

// search button handler
async function generalSearch(){
  await loadData();
  const q=document.querySelector("#search-box").value.trim();
  const out=document.querySelector("#results");
  if(q.length<3){ out.innerHTML=""; return; }
  const direct = data.filter(d=>d.question.toLowerCase().includes(q.toLowerCase()));
  const fuzzy  = fuse.search(q).map(r=>r.item);
  let context=[];
  try {
    const resp = await fetch("/.netlify/functions/embed", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ input:q, model:"text-embedding-3-small" })
    });
    const js=await resp.json();
    const qemb=js.data?.[0]?.embedding;
    if(qemb){
      context = data.map(d=>({
        item:d,
        score:cosineSimilarity(qemb,d.embedding)
      }))
      .filter(x=>x.score>0.3)
      .sort((a,b)=>b.score-a.score)
      .map(x=>x.item);
    }
  } catch(e){ console.warn("⚠️ Contextual fail:",e); }
  renderGrouped({direct,fuzzy,context}, out);
}

// AI chat handler
async function handleChat(){
  await loadData();
  const q=document.querySelector("#chat-input").value.trim();
  const resp=document.querySelector("#chatbot-response");
  resp.textContent="…thinking…";
  try {
    const r = await fetch("/.netlify/functions/proxy", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        model:"gpt-4o",
        messages:[{role:"user",content:q}]
      })
    });
    const j=await r.json();
    const ans=j.choices?.[0]?.message?.content;
    if(ans){ resp.textContent=ans; return; }
  } catch(e){ console.warn("⚠️ AI chat fail:",e); }
  // fallback to best DB answer
  const best=fuse.search(q,{limit:1})[0]?.item;
  resp.textContent = best?.answers[0]||"Sorry, I don’t know.";
}

// wire up buttons
document.querySelector("#search-button").onclick = generalSearch;
document.querySelector("#chat-button").onclick   = handleChat;
