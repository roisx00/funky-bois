// Inline Mr Prophet — full chatbot UI that replaces the §02 manual
// wire form on the dashboard. Same regex grammar + same sendBusts
// pipeline as the floating FAB version, just laid out as a proper
// conversation surface instead of a popover.
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../context/GameContext';
import { useToast } from './Toast';
import { normalizeXHandle, isValidXHandle } from '../utils/xHandle';

// ─── Grammar (mirrors ProphetChat.jsx) ──────────────────────────────
const RE_BUSTS_SEND = /(?:^|\b)(?:send|wire|transfer|give|gift|pay)\s+(\d{1,9})\s*(?:busts?|\$busts?)?\s+(?:to\s+)?@?([a-z0-9_]+)/i;
const RE_NFT_SEND = /(?:^|\b)(?:send|wire|transfer|give)\s+(?:#?(\d{1,5})\s*(?:nft|1969)|(?:nft|1969)\s*#?(\d{1,5}))\s+(?:to\s+)?@?([a-z0-9_]+)/i;
const RE_BALANCE = /\b(?:balance|how\s+(?:much|many)\s+(?:busts?|\$busts?))\b/i;
const RE_HELP = /\b(?:help|commands?|what\s+can\s+you\s+do)\b/i;
const RE_HI = /\b(?:hi|hello|hey|sup|yo|gm|gn)\b/i;

function parseIntent(text) {
  const t = String(text || '').trim();
  if (!t) return { kind: 'noop' };
  let m;
  if ((m = t.match(RE_BUSTS_SEND))) {
    return { kind: 'send_busts', amount: Number(m[1]), handle: normalizeXHandle(m[2]) };
  }
  if ((m = t.match(RE_NFT_SEND))) {
    return { kind: 'send_nft', tokenId: m[1] || m[2], handle: normalizeXHandle(m[3]) };
  }
  if (RE_BALANCE.test(t)) return { kind: 'balance' };
  if (RE_HELP.test(t))    return { kind: 'help' };
  if (RE_HI.test(t))      return { kind: 'hi' };
  return { kind: 'unknown', text: t };
}

const SUGGESTIONS = [
  'send 100 busts to @vitalik',
  "what's my balance",
  'wire 250 to @bro',
  'help',
];

const STORAGE_KEY = 'prophet:inline:msgs:v1';
const MAX_HISTORY = 60;

function uid() { return Math.random().toString(36).slice(2, 10); }

export default function ProphetInline() {
  const { sendBusts, bustsBalance, xUser } = useGame();
  const toast = useToast();

  const [msgs, setMsgs] = useState(() => loadHistory());
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef(null);
  const inputRef  = useRef(null);

  // Persist history (capped)
  useEffect(() => {
    try {
      const trimmed = msgs.slice(-MAX_HISTORY);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch { /* ignore */ }
  }, [msgs]);

  // Auto-scroll on new messages / typing indicator
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [msgs, typing]);

  // First-time intro
  useEffect(() => {
    if (msgs.length === 0) {
      pushBot([
        { type: 'kicker', text: 'WIRE CONCIERGE · ONLINE' },
        { type: 'line', text: "Tell me what to wire — I read plain English." },
        { type: 'note', text: "I never move funds without you tapping CONFIRM. Try a suggestion below." },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function push(m)         { setMsgs((p) => [...p, { ...m, id: uid(), at: Date.now() }]); }
  function pushUser(text)  { push({ role: 'user', kind: 'text', text }); }
  function pushBotText(t)  { push({ role: 'bot',  kind: 'text', text: t }); }
  function pushBot(blocks) { push({ role: 'bot',  kind: 'rich', blocks }); }
  function pushIntent(int) { push({ role: 'bot',  kind: 'intent', intent: int, status: 'pending' }); }
  function settle(id, p)   { setMsgs((prev) => prev.map((m) => (m.id === id ? { ...m, ...p } : m))); }

  // Inject a small typing pause for realism, then route the intent.
  function botRespond(fn, delay = 360) {
    setTyping(true);
    setTimeout(() => { setTyping(false); fn(); }, delay);
  }

  function handleSubmit(e) {
    e?.preventDefault?.();
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    pushUser(text);
    const intent = parseIntent(text);
    botRespond(() => routeIntent(intent));
  }

  function tapSuggestion(s) {
    if (sending) return;
    pushUser(s);
    const intent = parseIntent(s);
    botRespond(() => routeIntent(intent));
  }

  function routeIntent(intent) {
    if (intent.kind === 'hi') {
      pushBotText("Ser. Tell me what to wire — e.g. 'send 100 busts to @vitalik'.");
      return;
    }
    if (intent.kind === 'help') {
      pushBot([
        { type: 'kicker', text: 'WHAT I CAN DO' },
        { type: 'example', text: 'send 100 busts to @vitalik' },
        { type: 'example', text: 'wire 50 to @bro' },
        { type: 'example', text: "what's my balance" },
        { type: 'note', text: "NFT transfers go live post-mint. I'll handle those once your tokens are in your wallet." },
      ]);
      return;
    }
    if (intent.kind === 'balance') {
      pushBotText(`You hold ${(bustsBalance || 0).toLocaleString()} BUSTS.`);
      return;
    }
    if (intent.kind === 'send_nft') {
      pushBot([
        { type: 'line', text: `NFT #${intent.tokenId} → @${intent.handle}? Soon.` },
        { type: 'note', text: "On-chain NFT transfers are Phase 2 — they need a wallet signature, not a server call. I'll wire them in after mint settles." },
      ]);
      return;
    }
    if (intent.kind === 'send_busts') {
      const { amount, handle } = intent;
      if (!handle || !isValidXHandle(handle)) {
        pushBotText(`Couldn't read the handle. Try: 'send ${amount} busts to @vitalik'.`);
        return;
      }
      if (xUser?.username && handle === normalizeXHandle(xUser.username)) {
        pushBotText("Can't wire to yourself, ser.");
        return;
      }
      if (!Number.isFinite(amount) || amount < 1) {
        pushBotText('Amount has to be at least 1 BUSTS.');
        return;
      }
      if (amount > (bustsBalance || 0)) {
        pushBotText(`You only hold ${(bustsBalance || 0).toLocaleString()} BUSTS — that's short.`);
        return;
      }
      pushIntent({ kind: 'send_busts', amount, handle });
      return;
    }
    pushBot([
      { type: 'line', text: "I didn't catch that." },
      { type: 'note', text: "Try 'send 100 busts to @vitalik' or 'help' for the full menu." },
    ]);
  }

  async function confirmIntent(msg) {
    if (sending) return;
    if (msg.intent.kind !== 'send_busts') return;
    const { amount, handle } = msg.intent;
    setSending(true);
    settle(msg.id, { status: 'sending' });
    try {
      const r = await sendBusts(handle, amount);
      if (r?.ok) {
        settle(msg.id, {
          status: 'sent',
          result: { amount: r.amount, recipient: r.recipient },
        });
        toast.success(`Sent ${r.amount.toLocaleString()} BUSTS to @${r.recipient}`);
        // Bot follow-up confirmation message
        botRespond(
          () => pushBotText(`✓ Wired ${r.amount.toLocaleString()} BUSTS to @${r.recipient}. They claim from their inbox.`),
          280
        );
      } else {
        settle(msg.id, { status: 'failed', error: r?.reason || 'unknown' });
      }
    } catch (e) {
      settle(msg.id, { status: 'failed', error: e?.message || 'network' });
    } finally {
      setSending(false);
    }
  }
  function cancelIntent(msg) { settle(msg.id, { status: 'cancelled' }); }

  function clearHistory() {
    setMsgs([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setTimeout(() => pushBot([
      { type: 'kicker', text: 'WIRE CONCIERGE · ONLINE' },
      { type: 'line', text: 'Cleared. What do you want to wire?' },
    ]), 200);
  }

  return (
    <div className="proph-inline">
      <style>{`
        .proph-inline {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 560px;
          font-family: var(--font-display);
        }
        .proph-inline-head {
          display: flex;
          align-items: center;
          gap: 14px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--hairline);
          margin-bottom: 18px;
        }
        .proph-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: var(--ink);
          color: var(--accent);
          border: 1px solid var(--ink);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-display);
          font-style: italic;
          font-size: 26px;
          letter-spacing: -0.04em;
          line-height: 1;
          flex-shrink: 0;
        }
        .proph-inline-head-text { flex: 1; min-width: 0; }
        .proph-kicker {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.22em;
          color: var(--text-4);
          margin-bottom: 4px;
        }
        .proph-name {
          font-family: var(--font-display);
          font-style: italic;
          font-weight: 500;
          font-size: 44px;
          line-height: 1;
          letter-spacing: -0.03em;
          color: var(--ink);
        }
        .proph-subname {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 16px;
          line-height: 1.1;
          letter-spacing: -0.01em;
          color: var(--text-3);
          margin-top: 4px;
        }
        .proph-status {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.18em;
          color: var(--text-3);
          margin-top: 6px;
          text-transform: uppercase;
        }
        .proph-status .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent);
          border: 1px solid var(--ink);
          animation: proph-pulse 1.6s ease-in-out infinite;
        }
        @keyframes proph-pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.35; }
        }
        .proph-clear {
          width: 32px; height: 32px;
          background: transparent;
          border: 1px solid var(--hairline);
          color: var(--text-3);
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: 14px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          transition: background 120ms, color 120ms, border-color 120ms;
        }
        .proph-clear:hover { background: var(--ink); color: var(--accent); border-color: var(--ink); }

        .proph-thread {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding-right: 4px;
          margin-bottom: 14px;
          scrollbar-width: thin;
          min-height: 280px;
          max-height: 460px;
        }
        .proph-thread::-webkit-scrollbar { width: 4px; }
        .proph-thread::-webkit-scrollbar-thumb { background: var(--hairline); }

        .proph-row { display: flex; gap: 10px; align-items: flex-end; }
        .proph-row.user { justify-content: flex-end; }
        .proph-row.bot  { justify-content: flex-start; }

        .proph-mini-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--ink);
          color: var(--accent);
          border: 1px solid var(--ink);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-display);
          font-style: italic;
          font-size: 16px;
          line-height: 1;
          letter-spacing: -0.04em;
          flex-shrink: 0;
        }

        .proph-bubble {
          max-width: 78%;
          padding: 11px 14px;
          font-size: 14px;
          line-height: 1.45;
          letter-spacing: -0.005em;
          color: var(--ink);
          border: 1px solid var(--ink);
        }
        .proph-bubble.user {
          background: var(--paper);
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.04em;
        }
        .proph-bubble.bot {
          background: var(--paper);
          position: relative;
          padding-left: 18px;
        }
        .proph-bubble.bot::before {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 4px;
          background: var(--accent);
        }
        .proph-block + .proph-block { margin-top: 8px; }
        .proph-line {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 16px;
          letter-spacing: -0.005em;
        }
        .proph-example {
          display: inline-block;
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.04em;
          color: var(--ink);
          background: var(--paper-2);
          border: 1px solid var(--hairline);
          padding: 5px 9px;
        }
        .proph-note {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.04em;
          color: var(--text-3);
          line-height: 1.55;
        }

        .proph-typing {
          display: inline-flex;
          gap: 4px;
          padding: 12px 14px 12px 18px;
          background: var(--paper);
          border: 1px solid var(--ink);
          position: relative;
        }
        .proph-typing::before {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 4px;
          background: var(--accent);
        }
        .proph-typing span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--ink);
          opacity: 0.3;
          animation: proph-typing 1.2s ease-in-out infinite;
        }
        .proph-typing span:nth-child(2) { animation-delay: 0.18s; }
        .proph-typing span:nth-child(3) { animation-delay: 0.36s; }
        @keyframes proph-typing {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30%           { opacity: 1;   transform: translateY(-2px); }
        }

        .proph-intent {
          width: 100%;
          background: var(--paper-2);
          border: 1px solid var(--ink);
          padding: 16px 16px 14px;
          position: relative;
        }
        .proph-intent::before {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 4px;
          background: var(--accent);
        }
        .proph-intent-kicker {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.22em;
          color: var(--text-4);
          margin-bottom: 6px;
        }
        .proph-intent-line {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 20px;
          letter-spacing: -0.01em;
          color: var(--ink);
          line-height: 1.2;
          margin-bottom: 14px;
        }
        .proph-intent-amount {
          font-size: 28px;
          letter-spacing: -0.02em;
        }
        .proph-intent-actions {
          display: grid;
          grid-template-columns: 1fr 1.4fr;
          gap: 6px;
        }
        .proph-btn {
          padding: 11px 14px;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.18em;
          font-weight: 700;
          border: 1px solid var(--ink);
          cursor: pointer;
          transition: background 120ms, color 120ms;
        }
        .proph-btn.cancel  { background: var(--paper); color: var(--ink); }
        .proph-btn.cancel:hover:not(:disabled)  { background: var(--paper-3); }
        .proph-btn.confirm { background: var(--ink); color: var(--accent); }
        .proph-btn.confirm:hover:not(:disabled) { background: var(--accent); color: var(--ink); }
        .proph-btn:disabled { opacity: 0.55; cursor: not-allowed; }

        .proph-status-pill {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.18em;
          color: var(--text-3);
          padding: 7px 10px;
          margin-top: 12px;
          border: 1px dashed var(--hairline);
          text-align: center;
          text-transform: uppercase;
        }
        .proph-status-pill.sent   { color: var(--ink); border-color: var(--ink); background: var(--accent); }
        .proph-status-pill.failed { color: #c4352b; border-color: #c4352b; }

        .proph-suggest-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 10px;
        }
        .proph-suggest {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          padding: 7px 10px;
          background: var(--paper);
          border: 1px solid var(--hairline);
          color: var(--ink);
          cursor: pointer;
          transition: background 120ms, border-color 120ms;
        }
        .proph-suggest:hover:not(:disabled) { background: var(--accent); border-color: var(--ink); }
        .proph-suggest:disabled { opacity: 0.5; cursor: not-allowed; }

        .proph-form {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
        }
        .proph-input {
          width: 100%;
          background: var(--paper);
          border: 1px solid var(--ink);
          padding: 14px 16px;
          font-family: var(--font-mono);
          font-size: 13px;
          letter-spacing: 0.04em;
          color: var(--ink);
          outline: none;
          box-sizing: border-box;
        }
        .proph-input::placeholder { color: var(--text-4); letter-spacing: 0.08em; }
        .proph-send {
          padding: 14px 20px;
          background: var(--ink);
          color: var(--accent);
          border: 1px solid var(--ink);
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.22em;
          font-weight: 700;
          transition: background 120ms, color 120ms;
          display: flex; align-items: center; gap: 8px;
        }
        .proph-send:hover:not(:disabled) { background: var(--accent); color: var(--ink); }
        .proph-send:disabled { opacity: 0.4; cursor: not-allowed; }
        .proph-send-arrow {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 18px;
          letter-spacing: -0.02em;
        }
        @media (max-width: 540px) {
          .proph-thread  { max-height: 380px; }
          .proph-name    { font-size: 34px; }
          .proph-subname { font-size: 14px; }
          .proph-bubble  { max-width: 88%; }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="proph-inline-head">
        <div className="proph-avatar">P</div>
        <div className="proph-inline-head-text">
          <div className="proph-kicker">§02</div>
          <div className="proph-name">Mr Prophet.</div>
          <div className="proph-subname">Wire concierge.</div>
          <div className="proph-status">
            <span className="dot" />
            ONLINE · NATURAL LANGUAGE WIRE
          </div>
        </div>
        <button
          className="proph-clear"
          onClick={clearHistory}
          title="Clear conversation"
          aria-label="Clear conversation"
          type="button"
        >↺</button>
      </div>

      {/* ── Thread ── */}
      <div className="proph-thread" ref={scrollRef}>
        {msgs.map((m) => (
          <div key={m.id} className={`proph-row ${m.role}`}>
            {m.role === 'bot' ? <div className="proph-mini-avatar">P</div> : null}
            {m.kind === 'text' ? (
              <div className={`proph-bubble ${m.role}`}>{m.text}</div>
            ) : m.kind === 'rich' ? (
              <div className={`proph-bubble ${m.role}`} style={{ maxWidth: '88%' }}>
                {m.blocks.map((b, i) => (
                  <div key={i} className="proph-block">
                    {b.type === 'kicker'  ? <div className="proph-kicker">{b.text}</div> : null}
                    {b.type === 'line'    ? <div className="proph-line">{b.text}</div> : null}
                    {b.type === 'example' ? <div className="proph-example">{b.text}</div> : null}
                    {b.type === 'note'    ? <div className="proph-note">{b.text}</div> : null}
                  </div>
                ))}
              </div>
            ) : m.kind === 'intent' ? (
              <div className="proph-intent" style={{ width: '100%' }}>
                <div className="proph-intent-kicker">CONFIRM WIRE · TAP TO SEND</div>
                <div className="proph-intent-line">
                  Send <span className="proph-intent-amount">{Number(m.intent.amount).toLocaleString()}</span> BUSTS to @{m.intent.handle}?
                </div>
                {m.status === 'pending' ? (
                  <div className="proph-intent-actions">
                    <button className="proph-btn cancel" onClick={() => cancelIntent(m)} disabled={sending} type="button">CANCEL</button>
                    <button className="proph-btn confirm" onClick={() => confirmIntent(m)} disabled={sending} type="button">CONFIRM →</button>
                  </div>
                ) : null}
                {m.status === 'sending'   ? <div className="proph-status-pill">WIRING…</div> : null}
                {m.status === 'sent'      ? <div className="proph-status-pill sent">✓ SENT · BAL {(bustsBalance || 0).toLocaleString()}</div> : null}
                {m.status === 'cancelled' ? <div className="proph-status-pill">CANCELLED</div> : null}
                {m.status === 'failed'    ? <div className="proph-status-pill failed">FAILED · {String(m.error || '').toUpperCase()}</div> : null}
              </div>
            ) : null}
          </div>
        ))}
        {typing ? (
          <div className="proph-row bot">
            <div className="proph-mini-avatar">P</div>
            <div className="proph-typing"><span /><span /><span /></div>
          </div>
        ) : null}
      </div>

      {/* ── Suggestion chips ── */}
      <div className="proph-suggest-row">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            className="proph-suggest"
            onClick={() => tapSuggestion(s)}
            disabled={sending}
          >{s}</button>
        ))}
      </div>

      {/* ── Input bar ── */}
      <form className="proph-form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          className="proph-input"
          placeholder="Ask Prophet to wire BUSTS — e.g. send 100 to @vitalik"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={sending}
          autoComplete="off"
        />
        <button
          className="proph-send"
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label="Send"
        >
          SEND
          <span className="proph-send-arrow">→</span>
        </button>
      </form>
    </div>
  );
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch { return []; }
}
