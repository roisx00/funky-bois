// Mr Prophet — natural-language wire concierge.
//
// Free + offline parser (no API). Matches a small grammar of intents
// against the message text and offers an inline confirm card for each
// matched action. The actual transfer reuses the existing sendBusts()
// mutation from GameContext so all server-side rules (rate limits,
// self-send rejection, atomic debit, refund-on-fail) still apply.
//
// Phase 1 supports BUSTS sends + balance checks. NFT transfers are a
// post-mint Phase 2 — surfaced here as a polite "soon" response when
// the user asks.
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../context/GameContext';
import { useToast } from './Toast';
import { normalizeXHandle, isValidXHandle } from '../utils/xHandle';

// ─── Intent grammar ─────────────────────────────────────────────────
// Run user text through these in order; first match wins. Verbs are
// generous on purpose — the bar is "would the user expect this to
// trigger a wire?" not "is the syntax exact."

// e.g. "send 500 busts to @vitalik" / "wire 250 to nayuta" / "give 100 busts @bro"
const RE_BUSTS_SEND = /(?:^|\b)(?:send|wire|transfer|give|gift|pay)\s+(\d{1,9})\s*(?:busts?|\$busts?)?\s+(?:to\s+)?@?([a-z0-9_]+)/i;

// e.g. "send #233 nft to @vitalik" / "transfer nft #42 to @bro"
const RE_NFT_SEND = /(?:^|\b)(?:send|wire|transfer|give)\s+(?:#?(\d{1,5})\s*(?:nft|1969)|(?:nft|1969)\s*#?(\d{1,5}))\s+(?:to\s+)?@?([a-z0-9_]+)/i;

// e.g. "balance" / "what's my balance" / "how much busts do I have"
const RE_BALANCE = /\b(?:balance|how\s+(?:much|many)\s+(?:busts?|\$busts?))\b/i;

// e.g. "help" / "what can you do"
const RE_HELP = /\b(?:help|commands?|what\s+can\s+you\s+do)\b/i;

// e.g. "hello" / "hey prophet"
const RE_HI = /\b(?:hi|hello|hey|sup|yo|gm|gn)\b/i;

function parseIntent(text) {
  const t = String(text || '').trim();
  if (!t) return { kind: 'noop' };

  let m;
  if ((m = t.match(RE_BUSTS_SEND))) {
    const amount = Number(m[1]);
    const handle = normalizeXHandle(m[2]);
    return { kind: 'send_busts', amount, handle };
  }
  if ((m = t.match(RE_NFT_SEND))) {
    const tokenId = m[1] || m[2];
    const handle = normalizeXHandle(m[3]);
    return { kind: 'send_nft', tokenId, handle };
  }
  if (RE_BALANCE.test(t)) return { kind: 'balance' };
  if (RE_HELP.test(t))    return { kind: 'help' };
  if (RE_HI.test(t))      return { kind: 'hi' };
  return { kind: 'unknown', text: t };
}

// ─── Component ──────────────────────────────────────────────────────

const STORAGE_KEY = 'prophet:msgs:v1';
const MAX_HISTORY = 40;

function uid() { return Math.random().toString(36).slice(2, 10); }

export default function ProphetChat() {
  const { sendBusts, bustsBalance, xUser } = useGame();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState(() => loadHistory());
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Persist last MAX_HISTORY messages so the dock survives nav.
  useEffect(() => {
    try {
      const trimmed = msgs.slice(-MAX_HISTORY);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch { /* ignore quota */ }
  }, [msgs]);

  // Auto-scroll to newest message
  useEffect(() => {
    if (!open) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [msgs, open]);

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  // First-time greeting if history is empty
  useEffect(() => {
    if (msgs.length === 0) {
      pushBot([
        { type: 'kicker', text: 'WIRE CONCIERGE' },
        { type: 'line', text: 'I read plain English and wire BUSTS for you. Try:' },
        { type: 'example', text: 'send 250 busts to @vitalik' },
        { type: 'example', text: "what's my balance" },
        { type: 'note', text: 'You confirm every send. I never move funds without you tapping CONFIRM.' },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function push(message) {
    setMsgs((prev) => [...prev, { ...message, id: uid(), at: Date.now() }]);
  }
  function pushUser(text) {
    push({ role: 'user', kind: 'text', text });
  }
  function pushBot(blocks) {
    push({ role: 'bot', kind: 'rich', blocks });
  }
  function pushBotText(text) {
    push({ role: 'bot', kind: 'text', text });
  }
  function pushIntent(intent) {
    push({ role: 'bot', kind: 'intent', intent, status: 'pending' });
  }
  function settleIntent(id, patch) {
    setMsgs((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  async function handleSubmit(e) {
    e?.preventDefault?.();
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    pushUser(text);

    const intent = parseIntent(text);
    handleIntent(intent);
  }

  function handleIntent(intent) {
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
        { type: 'note', text: "NFT transfers go live post-mint. I'll handle those once tokens are in your wallet." },
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
        { type: 'note', text: "On-chain NFT transfers are a Phase 2 feature — they need a wallet signature, not a server call. I'll wire them in after mint settles." },
      ]);
      return;
    }
    if (intent.kind === 'send_busts') {
      const { amount, handle } = intent;
      // ── Pre-flight validation, mirror BustsTransferSection rules ──
      if (!handle || !isValidXHandle(handle)) {
        pushBotText(`I couldn't read the handle. Try: 'send ${amount} busts to @vitalik'.`);
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
      // Surface a confirm card the user has to tap
      pushIntent({ kind: 'send_busts', amount, handle });
      return;
    }
    // Unknown
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
    settleIntent(msg.id, { status: 'sending' });
    try {
      const r = await sendBusts(handle, amount);
      if (r?.ok) {
        settleIntent(msg.id, {
          status: 'sent',
          result: { amount: r.amount, recipient: r.recipient, transferId: r.transferId },
        });
        toast.success(`Sent ${r.amount.toLocaleString()} BUSTS to @${r.recipient}`);
      } else {
        settleIntent(msg.id, { status: 'failed', error: r?.reason || 'unknown' });
      }
    } catch (e) {
      settleIntent(msg.id, { status: 'failed', error: e?.message || 'network' });
    } finally {
      setSending(false);
    }
  }
  function cancelIntent(msg) {
    settleIntent(msg.id, { status: 'cancelled' });
  }

  function clearHistory() {
    setMsgs([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    pushBotText("Cleared. What do you want to wire?");
  }

  // ── Render ──
  return (
    <>
      <style>{`
        .prophet-fab {
          position: fixed;
          right: 24px;
          bottom: 24px;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: var(--ink);
          color: var(--accent);
          border: 1px solid var(--ink);
          cursor: pointer;
          z-index: 900;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 12px 30px rgba(0,0,0,0.18);
          transition: transform 160ms cubic-bezier(.2,.8,.2,1), background 160ms;
          font-family: var(--font-display);
          font-style: italic;
          font-size: 32px;
          letter-spacing: -0.04em;
          line-height: 1;
        }
        .prophet-fab:hover { transform: translateY(-3px); background: var(--accent); color: var(--ink); }
        .prophet-fab .pulse {
          position: absolute;
          top: 8px; right: 8px;
          width: 8px; height: 8px;
          border-radius: 50%;
          background: var(--accent);
          border: 1px solid var(--ink);
        }
        .prophet-fab:hover .pulse { background: var(--ink); }

        .prophet-panel {
          position: fixed;
          right: 24px;
          bottom: 24px;
          width: 380px;
          max-width: calc(100vw - 28px);
          height: 580px;
          max-height: calc(100vh - 80px);
          background: var(--paper);
          border: 1px solid var(--ink);
          z-index: 901;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 24px 60px rgba(0,0,0,0.18);
          animation: prophet-pop 220ms cubic-bezier(.2,.8,.2,1);
        }
        @keyframes prophet-pop {
          from { opacity: 0; transform: translateY(14px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .prophet-panel::before {
          content: '';
          position: absolute;
          left: 0; top: 0; right: 0;
          height: 4px;
          background: var(--accent);
        }
        .prophet-head {
          padding: 22px 22px 14px;
          border-bottom: 1px solid var(--hairline);
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
        }
        .prophet-head-kicker {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.22em;
          color: var(--text-4);
          margin-bottom: 4px;
        }
        .prophet-head-title {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 26px;
          line-height: 1;
          letter-spacing: -0.02em;
          color: var(--ink);
        }
        .prophet-head-actions {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
        }
        .prophet-head-btn {
          width: 30px; height: 30px;
          background: transparent;
          border: 1px solid var(--hairline);
          color: var(--text-3);
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: 13px;
          display: flex; align-items: center; justify-content: center;
          transition: background 120ms, color 120ms, border-color 120ms;
          line-height: 1;
        }
        .prophet-head-btn:hover { background: var(--ink); color: var(--accent); border-color: var(--ink); }

        .prophet-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 18px 18px 6px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          scrollbar-width: thin;
        }
        .prophet-scroll::-webkit-scrollbar { width: 4px; }
        .prophet-scroll::-webkit-scrollbar-thumb { background: var(--hairline); }

        .prophet-row { display: flex; }
        .prophet-row.user { justify-content: flex-end; }
        .prophet-row.bot  { justify-content: flex-start; }

        .prophet-bubble {
          max-width: 84%;
          padding: 10px 14px;
          font-family: var(--font-display);
          font-size: 14px;
          line-height: 1.4;
          letter-spacing: -0.01em;
          color: var(--ink);
          border: 1px solid var(--ink);
        }
        .prophet-bubble.user {
          background: var(--paper-2);
        }
        .prophet-bubble.bot {
          background: var(--paper);
          position: relative;
          padding-left: 18px;
        }
        .prophet-bubble.bot::before {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 4px;
          background: var(--accent);
        }
        .prophet-block + .prophet-block { margin-top: 8px; }
        .prophet-kicker {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.22em;
          color: var(--text-4);
        }
        .prophet-line {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 16px;
          letter-spacing: -0.01em;
          color: var(--ink);
        }
        .prophet-example {
          display: inline-block;
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.04em;
          color: var(--ink);
          background: var(--paper-2);
          border: 1px solid var(--hairline);
          padding: 5px 9px;
          margin-top: 2px;
        }
        .prophet-note {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.04em;
          color: var(--text-3);
          line-height: 1.5;
        }

        .prophet-intent {
          width: 100%;
          background: var(--paper-2);
          border: 1px solid var(--ink);
          padding: 14px 14px 12px;
          position: relative;
        }
        .prophet-intent::before {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 4px;
          background: var(--accent);
        }
        .prophet-intent-kicker {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.22em;
          color: var(--text-4);
          margin-bottom: 4px;
        }
        .prophet-intent-line {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 18px;
          letter-spacing: -0.01em;
          color: var(--ink);
          line-height: 1.2;
          margin-bottom: 12px;
        }
        .prophet-intent-amount {
          font-size: 24px;
          letter-spacing: -0.02em;
        }
        .prophet-intent-actions {
          display: grid;
          grid-template-columns: 1fr 1.4fr;
          gap: 6px;
        }
        .prophet-btn {
          padding: 9px 10px;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.18em;
          font-weight: 700;
          border: 1px solid var(--ink);
          cursor: pointer;
          transition: background 120ms, color 120ms;
        }
        .prophet-btn.cancel { background: var(--paper); color: var(--ink); }
        .prophet-btn.cancel:hover:not(:disabled) { background: var(--paper-3); }
        .prophet-btn.confirm { background: var(--ink); color: var(--accent); }
        .prophet-btn.confirm:hover:not(:disabled) { background: var(--accent); color: var(--ink); }
        .prophet-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .prophet-status {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.18em;
          color: var(--text-3);
          padding: 6px 8px;
          margin-top: 10px;
          border: 1px dashed var(--hairline);
          text-align: center;
          text-transform: uppercase;
        }
        .prophet-status.sent     { color: var(--ink); border-color: var(--ink); background: var(--accent); }
        .prophet-status.failed   { color: #c4352b; border-color: #c4352b; }

        .prophet-form {
          padding: 12px 12px 12px;
          border-top: 1px solid var(--hairline);
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 6px;
          background: var(--paper);
        }
        .prophet-input {
          width: 100%;
          background: var(--paper-2);
          border: 1px solid var(--ink);
          padding: 11px 12px;
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.03em;
          color: var(--ink);
          outline: none;
        }
        .prophet-input::placeholder { color: var(--text-4); letter-spacing: 0.06em; }
        .prophet-send {
          padding: 11px 14px;
          background: var(--ink);
          color: var(--accent);
          border: 1px solid var(--ink);
          cursor: pointer;
          font-family: var(--font-display);
          font-style: italic;
          font-size: 18px;
          line-height: 1;
          letter-spacing: -0.02em;
          transition: background 120ms, color 120ms;
        }
        .prophet-send:hover:not(:disabled) { background: var(--accent); color: var(--ink); }
        .prophet-send:disabled { opacity: 0.45; cursor: not-allowed; }

        @media (max-width: 480px) {
          .prophet-fab { right: 16px; bottom: 16px; width: 54px; height: 54px; font-size: 28px; }
          .prophet-panel { right: 8px; left: 8px; bottom: 8px; width: auto; height: 78vh; }
        }
      `}</style>

      {open ? (
        <div className="prophet-panel" role="dialog" aria-label="Mr Prophet — wire concierge">
          <div className="prophet-head">
            <div>
              <div className="prophet-head-kicker">MR PROPHET</div>
              <div className="prophet-head-title">Wire concierge.</div>
            </div>
            <div className="prophet-head-actions">
              <button
                className="prophet-head-btn"
                onClick={clearHistory}
                title="Clear chat"
                aria-label="Clear chat"
              >↺</button>
              <button
                className="prophet-head-btn"
                onClick={() => setOpen(false)}
                title="Close"
                aria-label="Close"
              >×</button>
            </div>
          </div>

          <div className="prophet-scroll" ref={scrollRef}>
            {msgs.map((m) => (
              <div key={m.id} className={`prophet-row ${m.role}`}>
                {m.kind === 'text' ? (
                  <div className={`prophet-bubble ${m.role}`}>{m.text}</div>
                ) : m.kind === 'rich' ? (
                  <div className={`prophet-bubble ${m.role}`} style={{ maxWidth: '90%' }}>
                    {m.blocks.map((b, i) => (
                      <div key={i} className="prophet-block">
                        {b.type === 'kicker' ? <div className="prophet-kicker">{b.text}</div> : null}
                        {b.type === 'line'   ? <div className="prophet-line">{b.text}</div> : null}
                        {b.type === 'example'? <div className="prophet-example">{b.text}</div> : null}
                        {b.type === 'note'   ? <div className="prophet-note">{b.text}</div> : null}
                      </div>
                    ))}
                  </div>
                ) : m.kind === 'intent' ? (
                  <div className="prophet-intent" style={{ width: '100%' }}>
                    <div className="prophet-intent-kicker">CONFIRM WIRE</div>
                    <div className="prophet-intent-line">
                      Send <span className="prophet-intent-amount">{Number(m.intent.amount).toLocaleString()}</span> BUSTS to @{m.intent.handle}?
                    </div>
                    {m.status === 'pending' ? (
                      <div className="prophet-intent-actions">
                        <button
                          className="prophet-btn cancel"
                          onClick={() => cancelIntent(m)}
                          disabled={sending}
                          type="button"
                        >CANCEL</button>
                        <button
                          className="prophet-btn confirm"
                          onClick={() => confirmIntent(m)}
                          disabled={sending}
                          type="button"
                        >CONFIRM →</button>
                      </div>
                    ) : null}
                    {m.status === 'sending'   ? <div className="prophet-status">WIRING…</div> : null}
                    {m.status === 'sent'      ? (
                      <div className="prophet-status sent">
                        ✓ SENT · BAL {(bustsBalance || 0).toLocaleString()}
                      </div>
                    ) : null}
                    {m.status === 'cancelled' ? <div className="prophet-status">CANCELLED</div> : null}
                    {m.status === 'failed'    ? (
                      <div className="prophet-status failed">FAILED · {String(m.error || '').toUpperCase()}</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <form className="prophet-form" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              className="prophet-input"
              placeholder="send 100 busts to @vitalik"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={sending}
              autoComplete="off"
            />
            <button
              className="prophet-send"
              type="submit"
              disabled={!draft.trim() || sending}
              aria-label="Send"
            >→</button>
          </form>
        </div>
      ) : (
        <button
          className="prophet-fab"
          onClick={() => setOpen(true)}
          title="Mr Prophet — wire concierge"
          aria-label="Open Mr Prophet"
          type="button"
        >
          P
          <span className="pulse" aria-hidden="true" />
        </button>
      )}
    </>
  );
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
