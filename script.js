// --- RFP Search + RAG Chat (front-end) ---
(() => {
  'use strict';

  let data = [];
  let fuse = null;

  const DATA_URLS = [
    'rfp_data_with_local_embeddings.json',
    '/rfp_data_with_local_embeddings.json',
    'rfp_data.json',
    '/rfp_data.json'
  ];

  // Cosine similarity
  function cosineSimilarity(a, b) {
    const n = Math.min(a?.length || 0, b?.length || 0);
    if (!n) return 0;
    let dot = 0, ma = 0, mb = 0;
    for (let i = 0; i < n; i++) {
      const x = a[i], y = b[i];
      dot += x * y; ma += x * x; mb += y * y;
    }
    const denom = Math.sqrt(ma) * Math.sqrt(mb);
    return denom ? (dot / denom) : 0;
  }

  async function fetchJSON(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  // Load dataset (first URL that works)
  async function loadData() {
    if (data.length) return data;
    let lastErr;
    for (const u of DATA_URLS) {
      try {
        const j = await fetchJSON(u);
        if (Array.isArray(j) && j.length) {
          data = j;
          console.log('✅ Loaded', data.length, 'records');
          break;
        }
      } catch (e) { lastErr = e; }
    }
    if (!data.length) {
      console.error('❌ Could not load dataset', lastErr || '');
      return [];
    }
    // Init Fuse (lexical fallback)
    if (window.Fuse) {
      fuse = new Fuse(data, {
        includeScore: true,
        threshold: 0.4,
        keys: ['question', 'answers']
      });
    }
    return data;
  }

  // Call Netlify embed function
  async function embed(text) {
    const r = await fetch('/.netlify/functions/embed', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ input: text, model: 'text-embedding-3-small' })
    });
    const j = await r.json();
    return j?.data?.[0]?.embedding || null;
  }

  // Top-K by embedding similarity
  async function topByEmbedding(q, k = 5) {
    const qemb = await embed(q);
    if (!qemb) return [];
    const scored = [];
    for (const d of data) {
      const e = d.embedding;
      if (!Array.isArray(e)) continue;
      const s = cosineSimilarity(qemb, e);
      if (Number.isFinite(s)) scored.push({ item: d, score: s });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k).map(x => x.item);
  }

  // Build concise context block for the model
  function buildContext(items, maxChars = 3500) {
    let out = '';
    for (const it of items) {
      const ans = Array.isArray(it.answers) ? it.answers[0] : (it.answers ?? '');
      const chunk = `Q: ${it.question}\nA: ${ans}\n---\n`;
      if ((out.length + chunk.length) > maxChars) break;
      out += chunk;
    }
    return out || '(no context)';
  }

  // ====== Search UI ======
  function renderGrouped(groups, container) {
    container.innerHTML = '';
    const buckets = [
      { title: '🔍 Direct Matches', items: groups.direct },
      { title: '✏️ Fuzzy Matches',  items: groups.fuzzy  },
      { title: '🤖 Contextual Matches', items: groups.context }
    ];

    for (const b of buckets) {
      if (!b.items?.length) continue;
      const section = document.createElement('section');
      section.innerHTML = `<h3 style="margin:12px 0">${b.title}</h3>`;
      const list = document.createElement('div');
      list.className = 'bucket-list';

      const renderList = (take) => {
        list.innerHTML = '';
        b.items.slice(0, take).forEach(it => {
          const ans = Array.isArray(it.answers) ? it.answers[0] : (it.answers ?? '');
          const card = document.createElement('div');
          card.className = 'card';
          card.style.cssText = 'padding:8px;margin:6px 0;border:1px solid #ddd;border-radius:6px;';
          card.innerHTML = `<strong>Q:</strong> ${it.question}<br><em>A:</em> ${ans}`;
          list.appendChild(card);
        });
      };

      let expanded = false;
      renderList(Math.min(3, b.items.length));
      section.appendChild(list);

      if (b.items.length > 3) {
        const toggle = document.createElement('button');
        toggle.textContent = 'Show more';
        toggle.style.cssText = 'margin:4px 0;padding:6px 10px;cursor:pointer;';
        toggle.addEventListener('click', () => {
          expanded = !expanded;
          toggle.textContent = expanded ? 'Show less' : 'Show more';
          renderList(expanded ? b.items.length : 3);
        });
        section.appendChild(toggle);
      }

      container.appendChild(section);
    }
  }

  async function generalSearch() {
    await loadData();
    const inputEl = document.querySelector('#search-box');
    const q = (inputEl?.value || '').trim();
    const out = document.querySelector('#results');
    if (!q || q.length < 3) { if (out) out.innerHTML = ''; return; }

    // direct lexical
    const direct = data.filter(d => (d.question || '').toLowerCase().includes(q.toLowerCase()));

    // fuzzy fallback
    const fuzzy = fuse ? fuse.search(q).map(r => r.item) : [];

    // contextual by embeddings
    let context = [];
    try { context = await topByEmbedding(q, 8); } catch (e) { console.warn('context fail', e); }

    renderGrouped({ direct, fuzzy, context }, out);
  }

  // ====== Chat UI (RAG) ======
  async function handleChat() {
    await loadData();
    const inputEl = document.querySelector('#chat-input');
    const respEl  = document.querySelector('#chatbot-response');
    const q = (inputEl?.value || '').trim();
    if (!q) return;
    if (respEl) respEl.textContent = '…thinking…';

    let ctxItems = [];
    try { ctxItems = await topByEmbedding(q, 5); } catch (e) { console.warn('embed fail', e); }
    if (!ctxItems.length && fuse) ctxItems = fuse.search(q, { limit: 5 }).map(r => r.item);

    const context = buildContext(ctxItems);

    const messages = [
      { role: 'system', content:
        'You are an assistant that answers strictly from the provided RFP context. ' +
        'If the answer is not clearly present in the context, reply exactly: "I don’t know."' },
      { role: 'user', content: `Question:\n${q}\n\nContext:\n${context}` }
    ];

    try {
      const r = await fetch('/.netlify/functions/proxy', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ model: 'gpt-4o-mini', messages })
      });
      const j = await r.json();
      const ans = j?.choices?.[0]?.message?.content || 'I don’t know.';
      if (respEl) respEl.textContent = ans;
    } catch (e) {
      console.error('chat error', e);
      if (respEl) respEl.textContent = 'AI call failed.';
    }
  }

  // Wire up
  document.addEventListener('DOMContentLoaded', () => {
    loadData();

    const sb = document.querySelector('#search-button');
    if (sb) sb.addEventListener('click', generalSearch);
    const sbox = document.querySelector('#search-box');
    if (sbox) sbox.addEventListener('keydown', e => { if (e.key === 'Enter') generalSearch(); });

    const cb = document.querySelector('#chat-button');
    if (cb) cb.addEventListener('click', handleChat);
    const cin = document.querySelector('#chat-input');
    if (cin) cin.addEventListener('keydown', e => { if (e.key === 'Enter') handleChat(); });

    // Expose for console testing
    window.generalSearch = generalSearch;
    window.handleChat = handleChat;
    window._probe = async (q='provider') => {
      await loadData();
      const top = await topByEmbedding(q, 3);
      return top.map(t => t.question);
    };
  });
})();
/* ===== CHAT SUPERPATCH (hybrid retrieval + softer prompt + DB fallback) ===== */
(() => {
  const log = (...a) => console.log('[chat]', ...a);

  async function callAI(messages, model='gpt-4o-mini') {
    const r = await fetch('/.netlify/functions/proxy', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ model, messages })
    });
    const j = await r.json().catch(()=> ({}));
    if (!j?.choices) throw new Error('AI error: '+(j?.error || r.status));
    return j.choices[0]?.message?.content?.trim() || '';
  }

  function cosine(a,b){ let d=0,ma=0,mb=0; for(let i=0;i<a.length;i++){d+=a[i]*b[i];ma+=a[i]*a[i];mb+=b[i]*b[i]} return d/Math.sqrt(ma*mb||1e-9) }

  async function embed(text){
    const r = await fetch('/.netlify/functions/embed',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ input:text, model:'text-embedding-3-small' })
    });
    const j = await r.json(); return j?.data?.[0]?.embedding || null;
  }

  function uniqByQuestion(arr){ const s=new Set(), out=[]; for(const it of arr){ const q=(it?.question||'').trim(); if(!q||s.has(q)) continue; s.add(q); out.push(it) } return out }

  async function buildContext(q, kE=5,kL=5,kF=5){
    await (typeof loadData==='function'?loadData():Promise.resolve());
    const all = Array.isArray(window.data)? window.data : [];

    const ql = q.toLowerCase();
    const lexical = all.filter(d => (d?.question||'').toLowerCase().includes(ql)).slice(0,kL);

    let fuzzy=[]; try{ if(window.fuse) fuzzy = fuse.search(q).map(r=>r.item).slice(0,kF) }catch{}

    let embHits=[]; try{
      const e = await embed(q);
      if(e){
        embHits = all
          .filter(d=> Array.isArray(d.embedding) && d.embedding.length===e.length)
          .map(d=>({item:d, score:cosine(e,d.embedding)}))
          .sort((a,b)=> b.score-a.score).slice(0,kE).map(x=>x.item);
      }
    }catch{}

    const merged = uniqByQuestion([...lexical,...fuzzy,...embHits]).slice(0,12);
    const parts = merged.map((t,i)=>`[${i+1}] Q: ${t.question}\nA: ${(Array.isArray(t.answers)?t.answers[0]:t.answers)||''}`);
    let ctx=''; for(const p of parts){ if((ctx.length+p.length)>1800) break; ctx += (ctx?'\n\n':'')+p }
    log('context items:', merged.length, 'chars:', ctx.length);
    return { text: ctx, items: merged };
  }

  function bestDbAnswer(q){
    try{ if(window.fuse){ const hit=fuse.search(q,{limit:1})?.[0]?.item; if(hit){ const a=Array.isArray(hit.answers)?hit.answers[0]:(hit.answers||''); return a||null }}}catch{}
    return null;
  }

  window.handleChat = async function handleChat(){
    const inp=document.querySelector('#chat-input');
    const out=document.querySelector('#chatbot-response');
    if(!inp||!out) return console.warn('chat elements missing');
    const q=(inp.value||'').trim(); if(!q){ out.textContent='Please type a question.'; return; }

    out.textContent='…thinking…';
    try{
      const { text:ctx } = await buildContext(q);
      const system=`You are an assistant for an RFP Q&A dataset.
Use the CONTEXT to answer precisely. If context is weak or empty, you may still answer briefly using general reasoning and say "Based on general knowledge,". Be concise.`;
      const user=`QUESTION: ${q}\n\nCONTEXT:\n${ctx||'(none)'}\n\nWrite a 1–3 sentence answer. Cite context indices if used (e.g., [1],[2]).`;

      let ans = await callAI([{role:'system',content:system},{role:'user',content:user}]);
      if(!ans || /i (do|don)('?|no)t know/i.test(ans)){ const fb = bestDbAnswer(q); if(fb) ans = fb + '  (best match from database)'; }
      out.textContent = ans || 'Sorry, I could not produce an answer.';
    }catch(e){
      console.warn('[chat] error', e);
      const fb = bestDbAnswer((document.querySelector('#chat-input')?.value||'').trim());
      out.textContent = fb || 'AI unavailable right now.';
    }
  };

  const btn=document.querySelector('#chat-button'); if(btn) btn.onclick=window.handleChat;
  const cin=document.querySelector('#chat-input'); if(cin) cin.addEventListener('keydown',e=>{ if(e.key==='Enter') window.handleChat() });
  log('chat superpatch active');
})();
