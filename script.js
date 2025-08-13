/* RFP Search + Chat (RAG + anti-IDK) */
(() => {
  // -------- globals --------
  window.data = window.data || [];
  window.fuse = window.fuse || null;

  const SEARCH_FILE = "rfp_data_with_local_embeddings.json"; // keep as-is
  const EMBED_URL   = "/.netlify/functions/embed";
  const CHAT_URL    = "/.netlify/functions/proxy";

  // -------- utils --------
  const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
  const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
  const byScoreDesc = (a,b)=> (b.score||0) - (a.score||0);

  const IDK_RX     = /\b(i\s*(do\s*not|don[’']?t)\s*know|unknown|not\s*sure|cannot\s*(answer|determine)|no\s*(idea|information))\b/i;
  const TOO_SHORT  = s => !s || String(s).trim().length < 28;
  const IS_WEAK    = s => TOO_SHORT(s) || IDK_RX.test(String(s||""));

  function cosine(a,b){
    let dot=0, ma=0, mb=0;
    for (let i=0;i<a.length && i<b.length;i++){
      dot += a[i]*b[i]; ma+=a[i]*a[i]; mb+=b[i]*b[i];
    }
    return dot / (Math.sqrt(ma)*Math.sqrt(mb) || 1);
  }

  function qSel(...alts){
    for (const sel of alts){ const el = document.querySelector(sel); if (el) return el; }
    return null;
  }

  // -------- data load + fuse --------
  async function loadData(){
    if (window.fuse && Array.isArray(window.data) && window.data.length) return;
    for (let tries=0; tries<2; tries++){
      try{
        const res = await fetch(`${SEARCH_FILE}?t=${Date.now()}`, {cache:'no-store'});
        window.data = await res.json();
        console.log("✅ Loaded", window.data.length, "records");
        window.fuse = new Fuse(window.data, {
          includeScore:true,
          threshold:0.3,
          keys: [{name:'question', weight:0.9}, {name:'answers', weight:0.1}]
        });
        return;
      }catch(e){
        console.warn("⚠️ loadData attempt failed", e);
        await sleep(400);
      }
    }
  }

  // -------- retrieval --------
  async function embed(text){
    const r = await fetch(EMBED_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ input:text, model:'text-embedding-3-small' })
    });
    const j = await r.json();
    return j?.data?.[0]?.embedding || null;
  }

  async function retrieve(q){
    await loadData();

    const data = window.data || [];
    const fuse = window.fuse;

    // 1) direct lexical
    const direct = data
      .filter(d => (d.question||'').toLowerCase().includes(q.toLowerCase()))
      .slice(0,20)
      .map(d => ({ item:d, score: 1 }));

    // 2) fuzzy
    const fuzzy = (fuse ? fuse.search(q, { limit: 20 }) : [])
      .map(r => ({ item:r.item, score: 1 - (r.score||0) }));

    // 3) embedding semantic
    let context = [];
    try{
      const qEmb = await embed(q);
      if (qEmb){
        context = data.map(d => ({
          item: d,
          score: d.embedding ? cosine(qEmb, d.embedding) : 0
        })).filter(x => x.score>0).sort(byScoreDesc).slice(0,30);
      }
    }catch(e){ console.warn("⚠️ embed search failed", e); }

    // unique by question, keep best score
    const seen = new Map();
    function take(list, tag){
      list.forEach(x=>{
        const key = (x.item?.question||'').slice(0,512);
        const cur = seen.get(key);
        const val = { ...x, tag };
        if (!cur || (x.score||0) > (cur.score||0)) seen.set(key,val);
      });
    }
    take(direct,'direct'); take(fuzzy,'fuzzy'); take(context,'context');

    const all = Array.from(seen.values()).sort(byScoreDesc);

    // slice buckets for UI
    return {
      direct:  all.filter(x=>x.tag==='direct').map(x=>x.item).slice(0,10),
      fuzzy:   all.filter(x=>x.tag==='fuzzy').map(x=>x.item).slice(0,10),
      context: all.filter(x=>x.tag==='context').map(x=>x.item).slice(0,10),
      allRanked: all.map(x=>x.item)
    };
  }

  function makeContext(items, maxChars=1800){
    let out = [];
    for (const it of items){
      const a = Array.isArray(it.answers) ? it.answers[0] : (it.answers ?? '');
      const q = (it.question||'').trim();
      if (!q || !a) continue;
      out.push(`Q: ${q}\nA: ${a}`);
      if (out.join('\n\n').length > maxChars) break;
    }
    return out.join('\n\n');
  }

  function bestDbAnswer(q, ranked){
    if (!ranked?.length) return null;
    const top = ranked[0];
    const a = Array.isArray(top.answers) ? top.answers[0] : top.answers;
    return a || null;
    // (we could be stricter by verifying q tokens ∈ question)
  }

  // -------- grouped search renderer --------
  function renderGrouped(groups, container){
    if (!container) return;
    container.innerHTML = "";
    const buckets = [
      {title:"🔍 Direct Matches", items: groups.direct},
      {title:"✏️ Fuzzy Matches", items: groups.fuzzy},
      {title:"🤖 Contextual Matches", items: groups.context}
    ];
    for (const b of buckets){
      if (!b.items?.length) continue;
      const sec = document.createElement('section');
      sec.innerHTML = `<h3 style="margin:12px 0">${b.title}</h3>`;
      const list = document.createElement('div');
      list.className = 'bucket-list';

      const draw = (n) => {
        list.innerHTML = "";
        b.items.slice(0,n).forEach(it=>{
          const a = Array.isArray(it.answers) ? it.answers[0] : (it.answers ?? '');
          const card = document.createElement('div');
          card.className = 'card';
          card.style.cssText = 'padding:8px;margin:6px 0;border:1px solid #ddd;border-radius:6px;';
          card.innerHTML = `<strong>Q:</strong> ${it.question}<br><em>A:</em> ${a}`;
          list.appendChild(card);
        });
      };

      let expanded = false;
      draw(Math.min(3, b.items.length));
      sec.appendChild(list);
      if (b.items.length > 3){
        const btn = document.createElement('button');
        btn.textContent = 'Show more';
        btn.style.cssText = 'margin:4px 0;padding:6px 10px;cursor:pointer;';
        btn.onclick = () => { expanded=!expanded; btn.textContent = expanded?'Show less':'Show more'; draw(expanded ? b.items.length : 3); };
        sec.appendChild(btn);
      }
      container.appendChild(sec);
    }
  }

  // -------- handlers --------
  async function generalSearch(){
    await loadData();
    const box = qSel('#search-box','input[name="search"]','input[placeholder*="Type at least"]');
    const out = qSel('#results','.results','#grouped-results');
    const q = (box?.value || '').trim();
    if (!q || q.length<3){ if(out) out.innerHTML=''; return; }
    const groups = await retrieve(q);
    renderGrouped(groups, out);
  }
  window.generalSearch = generalSearch;

  async function handleChat(){
    await loadData();
    const inp = qSel('#chat-input','input[name="chat"]','input[placeholder*="Ask"]');
    const out = qSel('#chatbot-response','.chat-output','#chat-response');
    const btn = qSel('#chat-button','button#ask-ai','button.ask-ai');
    const q = (inp?.value || '').trim();
    if (!q){ if(out) out.textContent='Please enter a question.'; return; }

    if (btn) btn.disabled = true;
    if (out) out.textContent = '…thinking…';

    try{
      const groups = await retrieve(q);
      const ctx = makeContext(groups.allRanked, 2000);
      const sys = [
        "You are a strict RFP Q&A assistant.",
        "Answer ONLY using the provided context.",
        "Quote exact phrases when appropriate.",
        "If the answer truly isn't present, say: 'I don’t know from the dataset.'"
      ].join(' ');
      let ans = '';

      // Call model
      try{
        const r = await fetch(CHAT_URL, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {role:'system', content: sys},
              {role:'user', content: `Context:\n${ctx}\n\nQuestion: ${q}\n\nAnswer from context:`}
            ]
          })
        });
        const j = await r.json();
        ans = j?.choices?.[0]?.message?.content || '';
      }catch(e){ console.warn('⚠️ chat call failed', e); }

      // Anti-IDK: fallback to best DB answer
      if (IS_WEAK(ans)){
        const fb = bestDbAnswer(q, groups.allRanked);
        ans = fb || 'No exact answer found in the dataset.';
      }

      if (out) out.textContent = ans;
    } finally {
      if (btn) btn.disabled = false;
    }
  }
  window.handleChat = handleChat;

  // -------- wire up --------
  const sBtn = qSel('#search-button','button#search','button.search');
  if (sBtn) sBtn.addEventListener('click', generalSearch);

  const cBtn = qSel('#chat-button','button#ask-ai','button.ask-ai');
  if (cBtn) cBtn.addEventListener('click', handleChat);

  const cIn = qSel('#chat-input','input[name="chat"]','input[placeholder*="Ask"]');
  if (cIn) cIn.addEventListener('keydown', e=>{ if(e.key==='Enter') handleChat(); });

  console.log('🧠 RAG chat wired.');
})();
