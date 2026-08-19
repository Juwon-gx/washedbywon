/**
 * WashedByWon chat widget — corrected version.
 *
 * This is the readable source equivalent of the fixes applied to the deployed
 * bundle on 2026-08-19. See DIAGNOSTICS.md for what each change fixes.
 *
 * Drop this into your source project (or diff it against your existing widget)
 * so the fixes survive your next `npm run build`.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API = 'https://washedbywon-backend.onrender.com';
const EASE = [0.22, 1, 0.36, 1];

// Render's free tier sleeps after ~15 min idle; a cold start can take 30-60s.
const REQUEST_TIMEOUT_MS = 45_000; // hard ceiling before we give up
const COLD_START_NOTICE_MS = 6_000; // tell the user *why* it's slow
const MAX_HISTORY = 12;             // cap payload/token growth
const MAX_INPUT = 500;

const GREETING = {
  role: 'assistant',
  content: "Hey! 👋 I'm Won's assistant. Ask me anything about our detailing services, pricing, or availability.",
};

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const hasOpened = useRef(false); // so the nudge badge never comes back

  // Nudge once, ever. (The original keyed this effect on `open`, so closing the
  // chat restarted the timer and re-showed a fake "1 unread" badge.)
  useEffect(() => {
    if (hasOpened.current) return;
    const t = setTimeout(() => {
      if (!hasOpened.current) setNudge(true);
    }, 4000);
    return () => clearTimeout(t);
  }, [open]);

  // Scroll the transcript container itself. `scrollIntoView` walks every
  // scrollable ancestor, which fights the page's Lenis smooth-scroll.
  useEffect(() => {
    const box = endRef.current?.parentElement;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Track the on-screen keyboard so the panel never hides under it, and never
  // grows taller than the visible viewport on a small phone.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const s = document.documentElement.style;
      s.setProperty('--wbw-vh', `${vv.height}px`);
      // clientHeight (layout viewport) is what `position: fixed` is measured
      // against — window.innerHeight is unreliable under device emulation.
      s.setProperty('--wbw-kb', `${Math.max(0, document.documentElement.clientHeight - vv.height - vv.offsetTop)}px`);
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    const ctl = new AbortController();
    const timeout = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
    const coldStart = setTimeout(() => {
      setMessages((prev) =>
        prev.some((m) => m.transient)
          ? prev
          : [...prev, {
              role: 'assistant',
              transient: true,
              content: "Still connecting — our server goes to sleep when it's quiet and can take up to 30 seconds to wake up. Hang tight…",
            }]
      );
    }, COLD_START_NOTICE_MS);

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          // Same shape the backend already expects: prior turns only, no
          // transient/error bubbles, capped so the payload stops growing.
          history: messages.filter((m) => !m.transient && !m.isError).slice(-MAX_HISTORY),
        }),
        signal: ctl.signal,
      });

      // fetch does NOT reject on 4xx/5xx — this check is the whole point.
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }

      const data = await res.json().catch(() => ({}));
      const reply = String(data.reply ?? data.message ?? data.response ?? '').trim();
      if (!reply) throw new Error('empty reply');

      setMessages((prev) => [...prev.filter((m) => !m.transient), { role: 'assistant', content: reply }]);
    } catch (err) {
      const content =
        err?.name === 'AbortError'
          ? 'That took too long to come back — our server may still be waking up. Try again in a few seconds, or text us and Won will answer personally.'
          : err?.status === 429
          ? "We're getting a lot of messages right now. Give it a few seconds and try again."
          : err?.status >= 500
          ? "Our assistant is having a moment. Try again shortly — or scroll down to book and we'll confirm by text."
          : "Couldn't reach our assistant. Check your connection and try again.";

      setMessages((prev) => [...prev.filter((m) => !m.transient), { role: 'assistant', isError: true, content }]);
      setInput(text); // never make the customer retype their question
    } finally {
      clearTimeout(timeout);
      clearTimeout(coldStart);
      setLoading(false);
    }
  };

  const canSend = !loading && input.trim().length > 0;

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.3, ease: EASE }}
            role="dialog"
            aria-label="Chat with WashedByWon"
            style={{
              position: 'fixed',
              bottom: 'calc(5.5rem + var(--wbw-kb, 0px))',
              right: '1.5rem',
              zIndex: 400,
              width: 'min(360px, calc(100vw - 2rem))',
              height: '480px',
              maxHeight: 'calc(var(--wbw-vh, 100vh) - 7.5rem)',
              background: 'rgba(14,6,23,0.97)',
              border: '1px solid rgba(107,33,212,0.3)',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(107,33,212,0.1)',
              backdropFilter: 'blur(20px)',
            }}
          >
            <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(107,33,212,0.08)', borderRadius: '12px 12px 0 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, var(--purple), var(--purple-bright))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 600 }}>W</div>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--white)' }}>WashedByWon</div>
                  <div style={{ fontSize: '0.58rem', color: 'var(--gold)', letterSpacing: '0.08em' }}>● Online</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                style={{ color: 'var(--muted2)', fontSize: '1.2rem', lineHeight: 1, padding: '0.5rem 0.75rem', margin: '-0.5rem -0.75rem' }}
              >
                ×
              </button>
            </div>

            <div
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
            >
              {messages.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div
                    style={{
                      maxWidth: '80%',
                      padding: '0.65rem 0.9rem',
                      background: m.role === 'user' ? 'var(--purple)' : 'rgba(255,255,255,0.05)',
                      border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                      borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      fontSize: '0.8rem',
                      lineHeight: 1.65,
                      color: m.isError ? '#fca5a5' : 'var(--white)',
                      whiteSpace: 'pre-wrap',   // keep the AI's line breaks and lists
                      overflowWrap: 'anywhere', // long URLs must not blow out the bubble
                    }}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: 'flex', gap: 4, padding: '0.5rem 0' }}>
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                      style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--muted2)' }}
                    />
                  ))}
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div style={{ padding: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.5rem' }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT))}
                onKeyDown={(e) => {
                  // isComposing guard: without it, IME users send half-typed words.
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent?.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                maxLength={MAX_INPUT}
                aria-label="Type your message"
                enterKeyHint="send"
                placeholder={loading ? 'Sending…' : 'Ask about services, pricing...'}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '0.6rem 0.8rem',
                  color: 'var(--white)',
                  // Must be >=16px on mobile or iOS Safari auto-zooms the page.
                  // Enforced globally by: @media (width<=768px){input,select,textarea{font-size:16px!important}}
                  fontSize: '0.78rem',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={send}
                disabled={!canSend}
                aria-label="Send message"
                className="btn-primary"
                style={{ height: 38, padding: '0 1rem', fontSize: '0.7rem', opacity: canSend ? 1 : 0.45, cursor: canSend ? 'pointer' : 'not-allowed' }}
              >
                →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5, ease: EASE }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => {
          hasOpened.current = true;
          setOpen(true);
          setNudge(false);
        }}
        aria-label="Open chat"
        style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 400, width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, var(--purple), var(--purple-bright))', boxShadow: '0 8px 32px rgba(107,33,212,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <AnimatePresence>
          {nudge && !open && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              style={{ position: 'absolute', top: -2, right: -2, width: 18, height: 18, borderRadius: '50%', background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', fontWeight: 700, color: '#000', border: '2px solid var(--black)' }}
            >
              1
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </>
  );
}
