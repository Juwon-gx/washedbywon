// WashedByWon text receptionist — the chat bubble on the main site.
// Answers questions and books appointments through the backend /api/chat endpoint.
(function () {
  const API = window.WBW_API || 'https://washedbywon-backend.onrender.com';
  const STORE_KEY = 'wbw_chat';
  const TEASER_KEY = 'wbw_chat_teaser_seen';
  const TEASER_DELAY = 4000;

  const GREETING = {
    role: 'assistant',
    content: "Hey! 👋 I'm Won's assistant. I can answer questions or book your detail right here. What can I help with?",
    options: ['Book a detail', 'See pricing', 'Ask a question'],
  };
  const TEASER = {
    text: 'Hey! 👋 Want your car detailed? What are you driving?',
    options: [
      { label: 'Sedan / Coupe', send: 'I have a sedan / coupe and want to book a detail.' },
      { label: 'SUV / Crossover', send: 'I have an SUV / crossover and want to book a detail.' },
      { label: 'Truck / Van', send: 'I have a truck / van and want to book a detail.' },
    ],
  };

  // ── Storage (session only; works without it) ──
  function load(key) {
    try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; }
  }
  function save(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }

  let messages = load(STORE_KEY) || [GREETING];
  let open = false;
  let sending = false;
  let retryText = null;

  // ── Styles ──
  const css = `
  .wbw-chat, .wbw-chat *{box-sizing:border-box;font-family:'DM Sans',system-ui,sans-serif}
  .wbw-launch{position:fixed;bottom:1.5rem;right:1.5rem;z-index:400;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;
    background:linear-gradient(135deg,var(--purple,#5c1f9e),var(--purple-bright,#7c3aed));box-shadow:0 8px 32px rgba(107,33,212,.5);
    display:flex;align-items:center;justify-content:center;transition:transform .2s}
  .wbw-launch:hover{transform:scale(1.08)}
  .wbw-launch:active{transform:scale(.95)}
  .wbw-badge{position:absolute;top:-2px;right:-2px;width:18px;height:18px;border-radius:50%;background:var(--gold,#c9a54c);color:#000;
    font-size:.55rem;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid var(--black,#08060b)}
  .wbw-teaser{position:fixed;bottom:5.4rem;right:1.5rem;z-index:400;width:min(290px,calc(100vw - 2rem));padding:.9rem 1rem 1rem;
    background:rgba(14,6,23,.97);border:1px solid rgba(107,33,212,.35);border-radius:14px 14px 2px 14px;color:#f3eefc;
    box-shadow:0 16px 60px rgba(0,0,0,.55);animation:wbw-pop .35s cubic-bezier(.22,1,.36,1)}
  .wbw-teaser p{margin:0 1.2rem .7rem 0;font-size:.85rem;line-height:1.5;cursor:pointer}
  .wbw-teaser-x{position:absolute;top:.35rem;right:.5rem;background:none;border:none;color:var(--muted2,#9b90ad);font-size:1.1rem;cursor:pointer;padding:.2rem}
  .wbw-panel{position:fixed;bottom:5.5rem;right:1.5rem;z-index:400;width:min(370px,calc(100vw - 2rem));height:min(540px,calc(100dvh - 7.5rem));
    background:rgba(14,6,23,.97);border:1px solid rgba(107,33,212,.3);border-radius:12px;display:flex;flex-direction:column;
    box-shadow:0 20px 80px rgba(0,0,0,.6);backdrop-filter:blur(20px);color:#f3eefc;animation:wbw-pop .3s cubic-bezier(.22,1,.36,1)}
  .wbw-head{padding:.9rem 1.1rem;border-bottom:1px solid var(--border,rgba(255,255,255,.08));display:flex;align-items:center;justify-content:space-between;
    background:rgba(107,33,212,.08);border-radius:12px 12px 0 0}
  .wbw-avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--purple,#5c1f9e),var(--purple-bright,#7c3aed));
    display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:600}
  .wbw-name{font-size:.8rem;font-weight:500}
  .wbw-online{font-size:.6rem;color:var(--gold,#c9a54c);letter-spacing:.08em}
  .wbw-close{background:none;border:none;color:var(--muted2,#9b90ad);font-size:1.4rem;line-height:1;cursor:pointer;padding:.2rem .4rem}
  .wbw-body{flex:1;overflow-y:auto;padding:1rem;display:flex;flex-direction:column;gap:.7rem;overscroll-behavior:contain}
  .wbw-msg{max-width:84%;padding:.65rem .9rem;font-size:.85rem;line-height:1.6;white-space:pre-wrap;word-wrap:break-word}
  .wbw-msg.assistant{align-self:flex-start;background:rgba(255,255,255,.05);border:1px solid var(--border,rgba(255,255,255,.08));border-radius:12px 12px 12px 2px}
  .wbw-msg.user{align-self:flex-end;background:var(--purple,#5c1f9e);border-radius:12px 12px 2px 12px}
  .wbw-chips{display:flex;flex-wrap:wrap;gap:.4rem}
  .wbw-chip{background:transparent;border:1px solid rgba(124,58,237,.6);color:#e9ddff;border-radius:999px;padding:.45rem .85rem;
    font-size:.78rem;cursor:pointer;transition:background .15s}
  .wbw-chip:hover,.wbw-chip:active{background:rgba(124,58,237,.25)}
  .wbw-card{align-self:stretch;border:1px solid var(--gold,#c9a54c);border-radius:10px;padding:.85rem 1rem;background:rgba(201,165,76,.06);font-size:.8rem;line-height:1.7}
  .wbw-card-title{color:var(--gold,#c9a54c);font-size:.65rem;letter-spacing:.14em;text-transform:uppercase;margin-bottom:.35rem}
  .wbw-card-total{margin-top:.35rem;font-weight:600}
  .wbw-typing{display:flex;gap:4px;padding:.4rem 0}
  .wbw-typing span{width:6px;height:6px;border-radius:50%;background:var(--muted2,#9b90ad);animation:wbw-blink 1.2s infinite}
  .wbw-typing span:nth-child(2){animation-delay:.2s}.wbw-typing span:nth-child(3){animation-delay:.4s}
  .wbw-input{padding:.7rem;border-top:1px solid var(--border,rgba(255,255,255,.08));display:flex;gap:.5rem}
  .wbw-input input{flex:1;min-width:0;background:rgba(255,255,255,.05);border:1px solid var(--border,rgba(255,255,255,.08));border-radius:6px;
    padding:.6rem .8rem;color:#f3eefc;font-size:16px;outline:none}
  .wbw-input input:focus{border-color:rgba(124,58,237,.6)}
  .wbw-send{height:42px;padding:0 1rem;border:none;border-radius:6px;background:var(--purple,#5c1f9e);color:#fff;font-size:.9rem;cursor:pointer}
  .wbw-send:disabled{opacity:.5;cursor:default}
  @keyframes wbw-pop{from{opacity:0;transform:translateY(16px) scale(.95)}to{opacity:1;transform:none}}
  @keyframes wbw-blink{0%,100%{opacity:.3}50%{opacity:1}}
  @media (max-width:480px){
    .wbw-panel{right:1rem;left:1rem;width:auto;bottom:5.2rem}
    .wbw-teaser{right:1rem}
    .wbw-launch{right:1rem}
  }`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ── DOM helpers ──
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  const root = el('div', 'wbw-chat');
  document.body.appendChild(root);

  const launch = el('button', 'wbw-launch');
  launch.setAttribute('aria-label', 'Open chat');
  launch.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  const badge = el('div', 'wbw-badge', '1');
  badge.style.display = 'none';
  launch.appendChild(badge);
  launch.addEventListener('click', () => (open ? closeChat() : openChat()));
  root.appendChild(launch);

  let panel, body, input, sendBtn, teaser;

  // ── Teaser pop-up ──
  function showTeaser() {
    if (open || load(TEASER_KEY) || messages.length > 1) return;
    save(TEASER_KEY, true);
    badge.style.display = 'flex';

    teaser = el('div', 'wbw-teaser');
    const x = el('button', 'wbw-teaser-x', '×');
    x.setAttribute('aria-label', 'Dismiss');
    x.addEventListener('click', hideTeaser);
    const p = el('p', null, TEASER.text);
    p.addEventListener('click', () => openChat());
    const chips = el('div', 'wbw-chips');
    TEASER.options.forEach(o => {
      const c = el('button', 'wbw-chip', o.label);
      c.addEventListener('click', () => { openChat(); send(o.send); });
      chips.appendChild(c);
    });
    teaser.append(x, p, chips);
    root.appendChild(teaser);
  }

  function hideTeaser() {
    if (teaser) { teaser.remove(); teaser = null; }
  }

  // ── Panel ──
  function buildPanel() {
    panel = el('div', 'wbw-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chat with WashedByWon');

    const head = el('div', 'wbw-head');
    const who = el('div');
    who.style.cssText = 'display:flex;align-items:center;gap:.65rem';
    const meta = el('div');
    meta.append(el('div', 'wbw-name', 'WashedByWon'), el('div', 'wbw-online', '● Online · books in chat'));
    who.append(el('div', 'wbw-avatar', 'W'), meta);
    const close = el('button', 'wbw-close', '×');
    close.setAttribute('aria-label', 'Close chat');
    close.addEventListener('click', closeChat);
    head.append(who, close);

    body = el('div', 'wbw-body');

    const bar = el('div', 'wbw-input');
    input = el('input');
    input.placeholder = 'Type a message…';
    input.setAttribute('aria-label', 'Message');
    input.addEventListener('keydown', e => { if (e.key === 'Enter') send(input.value); });
    sendBtn = el('button', 'wbw-send', '→');
    sendBtn.setAttribute('aria-label', 'Send');
    sendBtn.addEventListener('click', () => send(input.value));
    bar.append(input, sendBtn);

    panel.append(head, body, bar);
    root.appendChild(panel);
  }

  function openChat() {
    hideTeaser();
    badge.style.display = 'none';
    if (!panel) buildPanel();
    panel.style.display = 'flex';
    open = true;
    render();
    if (window.matchMedia('(min-width: 481px)').matches) input.focus();
  }

  function closeChat() {
    if (panel) panel.style.display = 'none';
    open = false;
  }

  function bookingCard(b) {
    const card = el('div', 'wbw-card');
    card.appendChild(el('div', 'wbw-card-title', '✓ Booking request sent'));
    const lines = [
      `${b.service} · ${b.vehicleSize}`,
      b.addons ? `Add-ons: ${b.addons}` : null,
      `${b.dateLabel} at ${b.time}`,
      b.address,
    ].filter(Boolean);
    lines.forEach(l => card.appendChild(el('div', null, l)));
    card.appendChild(el('div', 'wbw-card-total', `Est. total $${b.total} · pay after service`));
    card.appendChild(el('div', null, "Won will text you to confirm."));
    return card;
  }

  function render() {
    if (!body) return;
    body.innerHTML = '';
    messages.forEach((m, i) => {
      body.appendChild(el('div', `wbw-msg ${m.role}`, m.content));
      if (m.booking) body.appendChild(bookingCard(m.booking));
      const isLast = i === messages.length - 1;
      if (isLast && m.role === 'assistant' && m.options && m.options.length && !sending) {
        const chips = el('div', 'wbw-chips');
        m.options.forEach(o => {
          const c = el('button', 'wbw-chip', o);
          c.addEventListener('click', () => pick(o));
          chips.appendChild(c);
        });
        body.appendChild(chips);
      }
    });
    if (sending) {
      const t = el('div', 'wbw-typing');
      t.append(el('span'), el('span'), el('span'));
      body.appendChild(t);
    }
    sendBtn.disabled = sending;
    body.scrollTop = body.scrollHeight;
  }

  async function send(text) {
    text = (text || '').trim();
    if (!text || sending) return;
    if (input) input.value = '';
    messages.push({ role: 'user', content: text });
    sending = true;
    save(STORE_KEY, messages);
    render();

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messages.map(m => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();
      if (!res.ok || !data.reply) throw new Error(data.error || 'No reply');
      messages.push({ role: 'assistant', content: data.reply, options: data.options || [], booking: data.booking || null });
    } catch {
      // Take back the unsent message so "Try again" can resend it
      messages.pop();
      retryText = text;
      messages.push({
        role: 'assistant',
        content: "Sorry, I'm having trouble connecting. Please try again, or book with the form on this page.",
        options: ['Try again'],
        error: true,
      });
    } finally {
      sending = false;
      save(STORE_KEY, messages.filter(m => !m.error));
      render();
    }
  }

  function pick(option) {
    const last = messages[messages.length - 1];
    if (last && last.error && retryText) {
      messages.pop();
      send(retryText);
    } else {
      send(option);
    }
  }

  setTimeout(showTeaser, TEASER_DELAY);
})();
