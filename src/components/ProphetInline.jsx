// Inline Mr Prophet — full chatbot UI that replaces the §02 manual
// wire form on the dashboard. Same regex grammar + same sendBusts
// pipeline as the floating FAB version, just laid out as a proper
// conversation surface instead of a popover.
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../context/GameContext';
import { useToast } from './Toast';
import { normalizeXHandle, isValidXHandle } from '../utils/xHandle';

// ─── Grammar ────────────────────────────────────────────────────────
const RE_BUSTS_SEND = /(?:^|\b)(?:send|wire|transfer|give|gift|pay)\s+(\d{1,9})\s*(?:busts?|\$busts?)?\s+(?:to\s+)?@?([a-z0-9_]+)/i;
const RE_NFT_SEND = /(?:^|\b)(?:send|wire|transfer|give)\s+(?:#?(\d{1,5})\s*(?:nft|1969)|(?:nft|1969)\s*#?(\d{1,5}))\s+(?:to\s+)?@?([a-z0-9_]+)/i;
const RE_BALANCE = /\b(?:balance|how\s+(?:much|many)\s+(?:busts?|\$busts?))\b/i;
const RE_HELP = /\b(?:help|commands?|what\s+can\s+you\s+do)\b/i;
const RE_HI = /\b(?:hi|hello|hey|sup|yo|gm|gn)\b/i;

// Price queries — match a few natural shapes:
//   "eth price" / "price of btc" / "how much is sol" / "$pepe price"
//   "what's bitcoin at" / "btc to usd"
const RE_PRICE = /(?:price\s+of\s+|how\s+much\s+(?:is|for)\s+|what(?:'?s|\s+is)\s+|\$)?([a-z]{2,12})\s*(?:price|to\s+usd|in\s+usd)|(?:price\s+of\s+|how\s+much\s+(?:is|for)\s+)\$?([a-z]{2,12})/i;

// Common ticker / name → CoinGecko id. Extend as needed.
const COIN_MAP = {
  btc: 'bitcoin', bitcoin: 'bitcoin', xbt: 'bitcoin',
  eth: 'ethereum', ethereum: 'ethereum', ether: 'ethereum',
  sol: 'solana', solana: 'solana',
  doge: 'dogecoin', dogecoin: 'dogecoin',
  shib: 'shiba-inu', shiba: 'shiba-inu',
  pepe: 'pepe',
  bonk: 'bonk',
  wif: 'dogwifcoin',
  arb: 'arbitrum', arbitrum: 'arbitrum',
  op: 'optimism', optimism: 'optimism',
  matic: 'matic-network', polygon: 'matic-network', pol: 'matic-network',
  bnb: 'binancecoin', binance: 'binancecoin',
  ada: 'cardano', cardano: 'cardano',
  xrp: 'ripple', ripple: 'ripple',
  dot: 'polkadot', polkadot: 'polkadot',
  avax: 'avalanche-2', avalanche: 'avalanche-2',
  ltc: 'litecoin', litecoin: 'litecoin',
  link: 'chainlink', chainlink: 'chainlink',
  usdc: 'usd-coin',
  usdt: 'tether', tether: 'tether',
  trx: 'tron', tron: 'tron',
  near: 'near',
  apt: 'aptos', aptos: 'aptos',
  sui: 'sui',
  ton: 'the-open-network', toncoin: 'the-open-network',
  hype: 'hyperliquid', hyperliquid: 'hyperliquid',
  ena: 'ethena', ethena: 'ethena',
  mog: 'mog-coin',
  brett: 'based-brett',
  popcat: 'popcat',
  fart: 'fartcoin', fartcoin: 'fartcoin',
};

// Witty one-liners keyed by symbol — used as a kicker on the price
// response so Prophet stays in character.
const PRICE_QUIPS = {
  bitcoin:    'still digital gold, still loud about it.',
  ethereum:   'the laptop kid is doing fine.',
  solana:     'fast, until it isn\'t.',
  dogecoin:   'much wow. forever.',
  'shiba-inu':'still in the trenches.',
  pepe:       'frog war, ongoing.',
  bonk:       'a dog. on solana. you know the drill.',
  dogwifcoin: 'hat: still on.',
  'usd-coin': 'a dollar. groundbreaking.',
  tether:     'allegedly a dollar.',
  ripple:     'still suing the sec in your dreams.',
  arbitrum:   'rolling up.',
  optimism:   'rolling up, with vibes.',
  'matic-network': 'now called pol. confusing, ser.',
  binancecoin:'cz says hello from somewhere.',
  cardano:    'academic.',
  polkadot:   'parachains, parachains everywhere.',
  'avalanche-2': 'three chains in a trenchcoat.',
  litecoin:   'silver to bitcoin\'s gold. allegedly.',
  chainlink:  'oracle pilled.',
  tron:       'justin still onstage.',
  near:       'near to what, exactly.',
  aptos:      'move language enjoyer.',
  sui:        'move language enjoyer 2.',
  'the-open-network': 'telegram\'s lottery ticket.',
  hyperliquid:'perp degens, assemble.',
  ethena:     'synthetic dollar, real volatility.',
  'mog-coin': 'mog or be mogged.',
  'based-brett':'based.',
  popcat:     'pop pop pop.',
  fartcoin:   'no comment, ser.',
};

async function fetchPrice(cgId) {
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(cgId)}&vs_currencies=usd&include_24hr_change=true`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    const row = d?.[cgId];
    if (!row || row.usd == null) return null;
    return { usd: row.usd, change24h: row.usd_24h_change };
  } catch { return null; }
}

function formatPrice(usd) {
  if (usd >= 1)      return `$${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (usd >= 0.01)   return `$${usd.toFixed(4)}`;
  if (usd >= 0.0001) return `$${usd.toFixed(6)}`;
  return `$${usd.toExponential(2)}`;
}

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
  if ((m = t.match(RE_PRICE))) {
    const sym = String(m[1] || m[2] || '').toLowerCase();
    return { kind: 'price', symbol: sym };
  }
  if (RE_HELP.test(t)) return { kind: 'help' };
  if (RE_HI.test(t))   return { kind: 'hi' };
  return { kind: 'unknown', text: t };
}

const SUGGESTIONS = [
  'send 100 busts to @vitalik',
  "what's my balance",
  'eth price',
  'how much is sol',
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
        { type: 'kicker', text: 'PROPHET · ONLINE' },
        { type: 'line', text: "Plain English. Real wires. Confirm before anything moves." },
        { type: 'note', text: "I also do crypto prices. Try 'eth price' or just say what you want." },
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

  async function routeIntent(intent) {
    if (intent.kind === 'hi') {
      const greets = [
        "Hey ser. What we wiring?",
        "Gm. Tell me what to do.",
        "Showed up. What's the move?",
      ];
      pushBotText(greets[Math.floor(Math.random() * greets.length)]);
      return;
    }
    if (intent.kind === 'help') {
      pushBot([
        { type: 'kicker', text: 'WHAT I DO' },
        { type: 'example', text: 'send 100 busts to @vitalik' },
        { type: 'example', text: 'wire 50 to @bro' },
        { type: 'example', text: "what's my balance" },
        { type: 'example', text: 'eth price' },
        { type: 'example', text: 'how much is sol' },
        { type: 'note', text: "NFT transfers come post-mint. I'll move tokens once they're in your wallet — needs a signature, not a server." },
      ]);
      return;
    }
    if (intent.kind === 'balance') {
      const bal = bustsBalance || 0;
      const tail =
        bal === 0       ? "Empty. Earn some, ser." :
        bal < 100       ? "That's lunch money." :
        bal < 1000      ? "Modest stack." :
        bal < 10_000    ? "Respectable." :
        bal < 100_000   ? "Now we're talking." :
        bal < 1_000_000 ? "Whale alert." :
                          "Generational.";
      pushBotText(`${bal.toLocaleString()} BUSTS. ${tail}`);
      return;
    }
    if (intent.kind === 'price') {
      const sym = String(intent.symbol || '').toLowerCase();
      // Don't trip on "send 100 busts" — busts isn't a tradable coin and
      // the regex already gives send_busts priority above. Same for our
      // own context words that occasionally sneak in.
      const blocklist = new Set(['busts', 'bust', 'eth1969', 'thee', 'price', 'usd', 'help', 'balance']);
      const cgId = !blocklist.has(sym) ? COIN_MAP[sym] : null;
      if (!cgId) {
        pushBotText(`Never heard of $${sym.toUpperCase()}. Try a real coin, ser — eth, btc, sol, doge, you know.`);
        return;
      }
      const data = await fetchPrice(cgId);
      if (!data) {
        pushBotText(`Couldn't fetch ${cgId}. Coingecko ratelimited me, probably. Try in a sec.`);
        return;
      }
      const change = data.change24h;
      const sign = change > 0 ? '+' : '';
      const changeStr = Number.isFinite(change) ? `${sign}${change.toFixed(2)}%` : '—';
      const direction =
        change > 5  ? 'green candle szn.' :
        change > 0  ? 'mild green.' :
        change > -5 ? 'mild red.' :
                      'getting cooked.';
      pushBot([
        { type: 'kicker', text: `${sym.toUpperCase()} · ${cgId.toUpperCase()}` },
        { type: 'line', text: `${formatPrice(data.usd)}` },
        { type: 'note', text: `24H · ${changeStr} · ${direction} ${PRICE_QUIPS[cgId] || ''}`.trim() },
      ]);
      return;
    }
    if (intent.kind === 'send_nft') {
      pushBot([
        { type: 'line', text: `NFT #${intent.tokenId} → @${intent.handle}? Soon, ser.` },
        { type: 'note', text: "Phase 2. Once your tokens are in your wallet I'll wire them — needs a wallet signature, not a server call." },
      ]);
      return;
    }
    if (intent.kind === 'send_busts') {
      const { amount, handle } = intent;
      if (!handle || !isValidXHandle(handle)) {
        pushBotText(`Bad handle. Try a real one — e.g. 'send ${amount} busts to @vitalik'.`);
        return;
      }
      if (xUser?.username && handle === normalizeXHandle(xUser.username)) {
        pushBotText("You can't pay yourself, captain. That's not how money works.");
        return;
      }
      if (!Number.isFinite(amount) || amount < 1) {
        pushBotText("Minimum 1 BUSTS. We don't deal in crumbs.");
        return;
      }
      if (amount > (bustsBalance || 0)) {
        pushBotText(`You hold ${(bustsBalance || 0).toLocaleString()}. Math doesn't math, ser.`);
        return;
      }
      pushIntent({ kind: 'send_busts', amount, handle });
      return;
    }
    pushBot([
      { type: 'line', text: "Didn't catch that." },
      { type: 'note', text: "Try 'send 100 busts to @vitalik', 'eth price', or 'help'." },
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
        // Bot follow-up confirmation — keep the post-send reply short
        // and dry, in character.
        const tails = [
          `Wired ${r.amount.toLocaleString()} BUSTS to @${r.recipient}. They claim from their inbox.`,
          `Done. ${r.amount.toLocaleString()} BUSTS → @${r.recipient}. Now in their inbox.`,
          `Sent. @${r.recipient} owes you a follow at minimum.`,
        ];
        botRespond(
          () => pushBotText(`✓ ${tails[Math.floor(Math.random() * tails.length)]}`),
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
          background: var(--paper);
          border: 1px solid var(--ink);
          margin-top: 28px;
          margin-bottom: 36px;
          position: relative;
          overflow: hidden;
        }
        .proph-inline::before {
          content: '';
          position: absolute;
          left: 0; top: 0; right: 0;
          height: 5px;
          background: var(--accent);
          z-index: 2;
        }
        /* ── Studio hero band — ink background + lime accents */
        .proph-hero {
          background: var(--ink);
          color: var(--paper);
          padding: 28px 32px 24px;
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 22px;
          align-items: center;
          border-bottom: 1px solid var(--ink);
          position: relative;
        }
        .proph-hero::after {
          content: '';
          position: absolute;
          left: 0; right: 0; bottom: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(215,255,58,0.4), transparent);
        }
        .proph-avatar {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: var(--accent);
          flex-shrink: 0;
          position: relative;
          box-shadow: 0 0 0 4px rgba(215,255,58,0.12);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        /* Fallback letter — sits behind the image. If the image loads
           it covers the letter; if it fails (or isn't on disk yet) the
           "P" shows through cleanly. */
        .proph-avatar-fallback {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-display);
          font-style: italic;
          font-weight: 500;
          font-size: 38px;
          letter-spacing: -0.04em;
          line-height: 1;
          color: var(--ink);
          z-index: 0;
        }
        .proph-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          image-rendering: pixelated;
          image-rendering: crisp-edges;
          position: relative;
          z-index: 1;
        }
        .proph-avatar::after {
          content: '';
          position: absolute;
          right: 2px; bottom: 2px;
          width: 14px; height: 14px;
          border-radius: 50%;
          background: var(--accent);
          border: 2px solid var(--ink);
          animation: proph-pulse 1.8s ease-in-out infinite;
          z-index: 2;
        }
        .proph-hero-text { min-width: 0; }
        .proph-kicker {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.28em;
          color: var(--accent);
          margin-bottom: 6px;
          font-weight: 700;
        }
        .proph-name {
          font-family: var(--font-display);
          font-style: italic;
          font-weight: 500;
          font-size: 52px;
          line-height: 1;
          letter-spacing: -0.03em;
          color: var(--paper);
        }
        .proph-subname {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 18px;
          line-height: 1.1;
          letter-spacing: -0.01em;
          color: rgba(249,246,240,0.55);
          margin-top: 6px;
        }
        .proph-status {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.22em;
          color: var(--accent);
          margin-top: 12px;
          text-transform: uppercase;
          font-weight: 700;
        }
        .proph-status .dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--accent);
          animation: proph-pulse 1.6s ease-in-out infinite;
        }
        @keyframes proph-pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.35; }
        }
        .proph-hero-meta {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 10px;
          flex-shrink: 0;
        }
        .proph-bal {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 32px;
          line-height: 1;
          color: var(--paper);
          letter-spacing: -0.02em;
        }
        .proph-bal-label {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.24em;
          color: rgba(215,255,58,0.7);
          font-weight: 700;
          margin-top: 4px;
          text-align: right;
        }
        .proph-clear {
          width: 34px; height: 34px;
          background: transparent;
          border: 1px solid rgba(249,246,240,0.18);
          color: rgba(249,246,240,0.55);
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: 15px;
          display: flex; align-items: center; justify-content: center;
          transition: background 120ms, color 120ms, border-color 120ms;
        }
        .proph-clear:hover { background: var(--accent); color: var(--ink); border-color: var(--accent); }
        /* ── Body padding for the thread + form area ── */
        .proph-body {
          padding: 24px 28px 22px;
          display: flex;
          flex-direction: column;
        }

        .proph-thread {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding-right: 4px;
          margin-bottom: 16px;
          scrollbar-width: thin;
          min-height: 360px;
          max-height: 540px;
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
          background: var(--accent);
          border: 1px solid var(--ink);
          flex-shrink: 0;
          overflow: hidden;
          position: relative;
        }
        .proph-mini-avatar-fallback {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-display);
          font-style: italic;
          font-weight: 500;
          font-size: 16px;
          line-height: 1;
          color: var(--ink);
          z-index: 0;
        }
        .proph-mini-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          image-rendering: pixelated;
          image-rendering: crisp-edges;
          position: relative;
          z-index: 1;
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
        @media (max-width: 760px) {
          .proph-hero { padding: 24px 22px 22px; gap: 16px; }
          .proph-hero-meta { display: none; }
          .proph-name    { font-size: 40px; }
          .proph-subname { font-size: 16px; }
          .proph-avatar  { width: 60px; height: 60px; font-size: 30px; }
          .proph-body    { padding: 20px 22px 20px; }
        }
        @media (max-width: 540px) {
          .proph-thread  { max-height: 420px; min-height: 320px; }
          .proph-name    { font-size: 34px; }
          .proph-bubble  { max-width: 88%; }
          .proph-hero    { grid-template-columns: auto 1fr; }
          .proph-clear   { display: none; }
        }
      `}</style>

      {/* ── Studio hero band ── */}
      <div className="proph-hero">
        <div className="proph-avatar">
          <span className="proph-avatar-fallback" aria-hidden="true">P</span>
          <img
            src="/mr-prophet-pfp.png"
            alt=""
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        </div>
        <div className="proph-hero-text">
          <div className="proph-kicker">§02 · CONCIERGE</div>
          <div className="proph-name">Mr Prophet.</div>
          <div className="proph-subname">Wire concierge — talks, sends, knows prices.</div>
          <div className="proph-status">
            <span className="dot" />
            ONLINE · NATURAL LANGUAGE WIRE
          </div>
        </div>
        <div className="proph-hero-meta">
          <button
            className="proph-clear"
            onClick={clearHistory}
            title="Clear conversation"
            aria-label="Clear conversation"
            type="button"
          >↺</button>
          <div style={{ textAlign: 'right' }}>
            <div className="proph-bal">{(bustsBalance || 0).toLocaleString()}</div>
            <div className="proph-bal-label">YOUR BUSTS</div>
          </div>
        </div>
      </div>

      {/* ── Thread + input body ── */}
      <div className="proph-body">
      <div className="proph-thread" ref={scrollRef}>
        {msgs.map((m) => (
          <div key={m.id} className={`proph-row ${m.role}`}>
            {m.role === 'bot' ? <div className="proph-mini-avatar">
                <span className="proph-mini-avatar-fallback" aria-hidden="true">P</span>
                <img
                  src="/mr-prophet-pfp.png"
                  alt=""
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div> : null}
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
            <div className="proph-mini-avatar">
                <span className="proph-mini-avatar-fallback" aria-hidden="true">P</span>
                <img
                  src="/mr-prophet-pfp.png"
                  alt=""
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
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
