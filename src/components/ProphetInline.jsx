// Inline Mr Prophet — full chatbot UI that replaces the §02 manual
// wire form on the dashboard. Same regex grammar + same sendBusts
// pipeline as the floating FAB version, just laid out as a proper
// conversation surface instead of a popover.
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../context/GameContext';
import { useToast } from './Toast';
import { normalizeXHandle, isValidXHandle } from '../utils/xHandle';

// ─── Grammar ────────────────────────────────────────────────────────
// Beg patterns. Caught BEFORE send_busts so "send me 100 busts" routes
// to the roast handler instead of the regular wire flow. Two shapes:
// with an amount and without.
const RE_BEG_AMT   = /(?:^|\b)(?:send|give|wire|gimme|drop|throw)\s+(me|myself|prophet|theprophet|mrprophet|mr_prophet|the_prophet)\s+(\d{1,9})\s*(?:busts?|\$busts?)?/i;
const RE_BEG_NOAMT = /(?:(?:^|\b)(?:send|give|wire|gimme|drop|throw)\s+(?:me|myself|prophet|theprophet|mrprophet|mr_prophet|the_prophet)\s+(?:some\s+|a\s+few\s+|a\s+couple\s+|any\s+)?(?:busts?|\$busts?)|i\s+need\s+(?:some\s+)?(?:busts?|\$busts?)|(?:can|could|will|would)\s+(?:you|u)\s+(?:please\s+)?(?:send|give|drop|throw)\s+(?:me|myself)\s+(?:some\s+)?(?:busts?|\$busts?))/i;

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

// Fallback lookup for any coin not in COIN_MAP. CoinGecko's free
// /search endpoint returns coins ranked by market cap, so the top
// hit is usually the right one. We prefer exact-symbol matches over
// fuzzy name hits — if the user types "atom" we want Cosmos (ATOM),
// not whatever atom-themed memecoin happens to share keywords.
async function lookupCoin(query) {
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`);
    if (!r.ok) return null;
    const d = await r.json();
    const coins = Array.isArray(d?.coins) ? d.coins : [];
    if (coins.length === 0) return null;
    const q = String(query).toLowerCase();
    const exactSym = coins.find((c) => String(c.symbol || '').toLowerCase() === q);
    if (exactSym) return { id: exactSym.id, name: exactSym.name, symbol: exactSym.symbol };
    const apiSym = coins.find((c) => String(c.api_symbol || '').toLowerCase() === q);
    if (apiSym) return { id: apiSym.id, name: apiSym.name, symbol: apiSym.symbol };
    const top = coins[0];
    return { id: top.id, name: top.name, symbol: top.symbol };
  } catch { return null; }
}

// Generic quip pool used when we don't have a per-coin one-liner.
// Picked at random so repeated long-tail queries don't read identical.
const GENERIC_QUIPS = [
  'the chart speaks for itself.',
  'no notes.',
  'send help.',
  "rotational liquidity, you know how it is.",
  'pure vibes.',
  "couldn't make this up.",
  'sigma move.',
  "we're so back. or are we.",
];
function genericQuip() {
  return GENERIC_QUIPS[Math.floor(Math.random() * GENERIC_QUIPS.length)];
}

// Roasts when a user asks Prophet to send BUSTS to Prophet himself or
// to "me / myself". Polite but cheeky — never mean. Picked at random
// so repeated begs read different.
const ROASTS_NO_AMT = [
  "Negative, ser. I make wires, I don't take them.",
  "Kind offer. I don't have hands.",
  "Concierges don't tip themselves.",
  "I'd love to. I literally cannot.",
  "I run on prophecy, not BUSTS.",
  "Asking the concierge for tips. Bold strategy.",
  "Try the tasks tab. That's how the rest of us eat.",
  "I'm not a wallet, ser. Try someone with thumbs.",
  "I appreciate the thought. Still no.",
  "Beg me again and I'll roast you again.",
];
const ROASTS_AMT = [
  "{amt} BUSTS to me? I literally cannot accept. Save it for someone with a wallet.",
  "{amt}? Generous. Also impossible. I have no balance.",
  "You want to wire {amt} to the wire concierge. Read that back to yourself.",
  "{amt} BUSTS, declined. I'm not on the ledger, ser.",
  "Flattered by the {amt}. Still not built to receive.",
  "If you've got {amt} to spare, send them to a holder. I'm fine.",
  "{amt}? I'd take it, but my wallet is conceptual.",
  "Try this energy on @vitalik instead — he's got {amt} room.",
];
function pickRoast(amount) {
  if (amount == null) {
    return ROASTS_NO_AMT[Math.floor(Math.random() * ROASTS_NO_AMT.length)];
  }
  const tmpl = ROASTS_AMT[Math.floor(Math.random() * ROASTS_AMT.length)];
  return tmpl.replace('{amt}', amount.toLocaleString());
}

function formatPrice(usd) {
  if (usd >= 1)      return `$${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (usd >= 0.01)   return `$${usd.toFixed(4)}`;
  if (usd >= 0.0001) return `$${usd.toFixed(6)}`;
  return `$${usd.toExponential(2)}`;
}

// Handles the user might use to mean "send to Prophet" or "send to me"
// — anything in here triggers the roast path instead of a real wire.
const SELF_REFS = new Set([
  'me', 'myself', 'i',
  'prophet', 'theprophet', 'mrprophet', 'mr_prophet', 'the_prophet',
]);

function parseIntent(text) {
  const t = String(text || '').trim();
  if (!t) return { kind: 'noop' };
  let m;
  // Beg patterns first so "send me 100 busts" routes to the roast.
  if ((m = t.match(RE_BEG_AMT))) {
    return { kind: 'beg', target: String(m[1] || '').toLowerCase(), amount: Number(m[2]) };
  }
  if ((m = t.match(RE_BEG_NOAMT))) {
    return { kind: 'beg', target: 'me', amount: null };
  }
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

// Rotating TIPs shown on the empty-state card. Mono-code style, like
// Bankr's "TWAP $500 into ETH" suggestion — concrete, copy-pasteable.
const PROPHET_TIPS = [
  { code: 'send 100 busts to @vitalik', note: 'Wire BUSTS to any X handle. They claim from their inbox.' },
  { code: "what's my balance",          note: 'Check your BUSTS balance and where you sit in the pool.' },
  { code: 'eth price',                  note: 'Live prices for any coin Coingecko knows about.' },
  { code: 'how much is sol',            note: 'Same energy, different ticker. Try any token symbol.' },
];
function pickTip() {
  return PROPHET_TIPS[Math.floor(Math.random() * PROPHET_TIPS.length)];
}

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
  const [tip] = useState(() => pickTip());
  const scrollRef = useRef(null);
  const inputRef  = useRef(null);

  const isEmpty = msgs.length === 0;

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
      // Block our own context words so "balance price" or "help price"
      // don't accidentally hit the lookup. send_busts already has
      // priority over price in parseIntent so 'busts' shouldn't reach
      // here, but keep it in the blocklist as belt-and-braces.
      const blocklist = new Set(['busts', 'bust', 'eth1969', 'thee', 'price', 'usd', 'help', 'balance']);
      if (blocklist.has(sym)) {
        pushBotText(`Try a real ticker, ser — eth, btc, sol, atom, pengu, anything that exists.`);
        return;
      }

      // Fast path: hardcoded majors avoid a network round-trip for coin id.
      let cgId  = COIN_MAP[sym];
      let label = sym.toUpperCase();

      // Fallback: ask CoinGecko's search index for any coin matching the
      // user's input. Returns the highest-ranked match (or an exact
      // symbol match if one exists). Covers everything from $PEPE to
      // $ATOM to whatever launched yesterday.
      if (!cgId) {
        const found = await lookupCoin(sym);
        if (!found) {
          pushBotText(`Couldn't find $${sym.toUpperCase()}. Either it doesn't exist or Coingecko hasn't indexed it yet.`);
          return;
        }
        cgId  = found.id;
        label = `${String(found.symbol || sym).toUpperCase()} · ${found.name}`;
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
      const quip = PRICE_QUIPS[cgId] || genericQuip();
      pushBot([
        { type: 'kicker', text: label },
        { type: 'line', text: `${formatPrice(data.usd)}` },
        { type: 'note', text: `24H · ${changeStr} · ${direction} ${quip}`.trim() },
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
    if (intent.kind === 'beg') {
      pushBotText(pickRoast(intent.amount));
      return;
    }
    if (intent.kind === 'send_busts') {
      const { amount, handle } = intent;
      // "send 100 to me" / "send 50 to prophet" → roast
      if (handle && SELF_REFS.has(handle)) {
        pushBotText(pickRoast(amount));
        return;
      }
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
    <div className={`proph-inline ${isEmpty ? 'is-empty' : 'is-chat'}`}>
      <style>{`
        .proph-inline {
          display: flex;
          flex-direction: column;
          background: var(--paper-1);
          border: 1px solid var(--hairline);
          margin-top: 28px;
          margin-bottom: 36px;
          position: relative;
          overflow: hidden;
        }
        .proph-inline::before {
          content: '';
          position: absolute;
          left: 0; top: 0; right: 0;
          height: 3px;
          background: var(--accent);
          z-index: 2;
        }

        /* ── Compact header (chat state only) ─────────────────────── */
        .proph-bar {
          display: grid;
          grid-template-columns: auto 1fr auto auto;
          gap: 14px;
          align-items: center;
          padding: 14px 22px;
          border-bottom: 1px solid var(--hairline);
          background: var(--paper-1);
        }
        .proph-bar .proph-mark {
          width: 32px; height: 32px;
          border-radius: 50%;
          background: var(--accent);
          border: 1px solid var(--ink);
          position: relative;
          overflow: hidden;
          flex-shrink: 0;
        }
        .proph-mark .fallback {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-display);
          font-style: italic;
          font-weight: 500;
          font-size: 18px;
          color: var(--ink);
          z-index: 0;
        }
        .proph-mark img {
          width: 100%; height: 100%;
          object-fit: cover;
          display: block;
          image-rendering: pixelated;
          image-rendering: crisp-edges;
          position: relative;
          z-index: 1;
        }
        .proph-bar-name {
          font-family: var(--font-display);
          font-style: italic;
          font-weight: 500;
          font-size: 22px;
          line-height: 1;
          letter-spacing: -0.02em;
          color: var(--ink);
        }
        .proph-bar-status {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-top: 4px;
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.22em;
          color: var(--text-3);
          font-weight: 700;
          text-transform: uppercase;
        }
        .proph-bar-status .dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--accent);
          animation: proph-pulse 1.6s ease-in-out infinite;
        }
        .proph-bar-bal {
          text-align: right;
        }
        .proph-bar-bal .num {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 20px;
          line-height: 1;
          letter-spacing: -0.02em;
          color: var(--ink);
        }
        .proph-bar-bal .lbl {
          font-family: var(--font-mono);
          font-size: 8px;
          letter-spacing: 0.24em;
          color: var(--text-4);
          font-weight: 700;
          margin-top: 3px;
        }
        .proph-clear {
          width: 30px; height: 30px;
          background: transparent;
          border: 1px solid var(--hairline);
          color: var(--text-3);
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: 14px;
          display: flex; align-items: center; justify-content: center;
          transition: background 120ms, color 120ms, border-color 120ms;
        }
        .proph-clear:hover { background: var(--accent); color: var(--ink); border-color: var(--ink); }

        @keyframes proph-pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.35; }
        }

        /* ── Empty-state hero (centered greeting + TIP card) ──────── */
        .proph-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 64px 28px 32px;
          text-align: center;
        }
        .proph-empty-mark {
          width: 56px; height: 56px;
          border-radius: 50%;
          background: var(--accent);
          border: 1px solid var(--ink);
          position: relative;
          overflow: hidden;
          margin-bottom: 22px;
          box-shadow: 0 0 0 6px rgba(215,255,58,0.15);
        }
        .proph-empty-mark .fallback {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-display);
          font-style: italic;
          font-weight: 500;
          font-size: 30px;
          color: var(--ink);
          z-index: 0;
        }
        .proph-empty-mark img {
          width: 100%; height: 100%;
          object-fit: cover;
          display: block;
          image-rendering: pixelated;
          image-rendering: crisp-edges;
          position: relative;
          z-index: 1;
        }
        .proph-empty-kicker {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.28em;
          color: var(--text-3);
          font-weight: 700;
          margin-bottom: 10px;
        }
        .proph-empty-h1 {
          font-family: var(--font-display);
          font-style: italic;
          font-weight: 500;
          font-size: 44px;
          line-height: 1.05;
          letter-spacing: -0.03em;
          color: var(--ink);
          margin: 0 0 8px;
        }
        .proph-empty-sub {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 17px;
          line-height: 1.4;
          color: var(--text-3);
          margin-bottom: 28px;
          max-width: 460px;
        }

        .proph-tip {
          width: 100%;
          max-width: 560px;
          background: var(--paper-2);
          border: 1px solid var(--hairline);
          padding: 16px 18px 14px;
          text-align: left;
          position: relative;
        }
        .proph-tip-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }
        .proph-tip-badge {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.24em;
          font-weight: 700;
          color: var(--ink);
          background: var(--accent);
          padding: 4px 8px;
        }
        .proph-tip-code {
          flex: 1;
          font-family: var(--font-mono);
          font-size: 13px;
          letter-spacing: 0.02em;
          color: var(--ink);
          background: var(--paper-1);
          border: 1px solid var(--hairline);
          padding: 8px 10px;
          cursor: pointer;
          transition: background 120ms, border-color 120ms;
        }
        .proph-tip-code:hover { background: var(--accent); border-color: var(--ink); }
        .proph-tip-note {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.04em;
          color: var(--text-3);
          line-height: 1.55;
        }

        /* ── Chat thread (chat state only) ────────────────────────── */
        .proph-body {
          padding: 22px 26px 18px;
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
          margin-bottom: 14px;
          scrollbar-width: thin;
          min-height: 320px;
          max-height: 520px;
        }
        .proph-thread::-webkit-scrollbar { width: 4px; }
        .proph-thread::-webkit-scrollbar-thumb { background: var(--hairline); }

        .proph-row { display: flex; gap: 10px; align-items: flex-end; }
        .proph-row.user { justify-content: flex-end; }
        .proph-row.bot  { justify-content: flex-start; }

        .proph-mini-avatar {
          width: 26px;
          height: 26px;
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
          font-size: 15px;
          line-height: 1;
          color: var(--ink);
          z-index: 0;
        }
        .proph-mini-avatar img {
          width: 100%; height: 100%;
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
        }
        .proph-bubble.user {
          background: var(--ink);
          color: var(--paper-1);
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.04em;
          border-radius: 14px 14px 2px 14px;
        }
        .proph-bubble.bot {
          background: var(--paper-2);
          border: 1px solid var(--hairline);
          border-radius: 14px 14px 14px 2px;
          position: relative;
        }
        .proph-block + .proph-block { margin-top: 8px; }
        .proph-kicker {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.24em;
          color: var(--text-4);
          font-weight: 700;
        }
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
          background: var(--paper-1);
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
          padding: 12px 14px;
          background: var(--paper-2);
          border: 1px solid var(--hairline);
          border-radius: 14px 14px 14px 2px;
        }
        .proph-typing span {
          width: 6px; height: 6px;
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
          border-radius: 8px;
        }
        .proph-intent::before {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 4px;
          background: var(--accent);
          border-radius: 8px 0 0 8px;
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
        .proph-btn.cancel  { background: var(--paper-1); color: var(--ink); }
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

        /* ── Input dock (single rounded field + circular send) ───── */
        .proph-dock {
          padding: 10px 22px 22px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .proph-inline.is-empty .proph-dock {
          padding-top: 22px;
          padding-bottom: 28px;
        }
        .proph-suggest-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          justify-content: center;
        }
        .proph-suggest {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          padding: 6px 10px;
          background: var(--paper-1);
          border: 1px solid var(--hairline);
          color: var(--text-3);
          cursor: pointer;
          transition: background 120ms, color 120ms, border-color 120ms;
          border-radius: 999px;
        }
        .proph-suggest:hover:not(:disabled) {
          background: var(--accent);
          color: var(--ink);
          border-color: var(--ink);
        }
        .proph-suggest:disabled { opacity: 0.5; cursor: not-allowed; }

        .proph-form {
          position: relative;
          display: flex;
          align-items: center;
          background: var(--paper-1);
          border: 1px solid var(--hairline);
          border-radius: 999px;
          padding: 6px 6px 6px 18px;
          transition: border-color 120ms, box-shadow 120ms;
        }
        .proph-form:focus-within {
          border-color: var(--ink);
          box-shadow: 0 0 0 3px rgba(215,255,58,0.18);
        }
        .proph-input {
          flex: 1;
          background: transparent;
          border: none;
          padding: 12px 12px 12px 0;
          font-family: var(--font-mono);
          font-size: 13px;
          letter-spacing: 0.02em;
          color: var(--ink);
          outline: none;
          min-width: 0;
        }
        .proph-input::placeholder { color: var(--text-4); letter-spacing: 0.04em; }
        .proph-send {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: var(--ink);
          color: var(--accent);
          border: 1px solid var(--ink);
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          transition: background 120ms, color 120ms, transform 120ms;
        }
        .proph-send:hover:not(:disabled) {
          background: var(--accent);
          color: var(--ink);
          transform: translateX(1px);
        }
        .proph-send:disabled {
          background: var(--paper-3);
          color: var(--text-4);
          border-color: var(--hairline);
          cursor: not-allowed;
        }
        .proph-send-arrow {
          font-family: var(--font-display);
          font-style: italic;
          font-weight: 500;
        }

        @media (max-width: 760px) {
          .proph-empty       { padding: 48px 22px 24px; }
          .proph-empty-h1    { font-size: 34px; }
          .proph-empty-sub   { font-size: 15px; }
          .proph-bar         { padding: 12px 18px; gap: 10px; }
          .proph-bar-name    { font-size: 18px; }
          .proph-bar-bal .num { font-size: 17px; }
          .proph-body        { padding: 18px 18px 14px; }
          .proph-dock        { padding: 8px 18px 20px; }
        }
        @media (max-width: 540px) {
          .proph-thread     { max-height: 420px; min-height: 280px; }
          .proph-empty-h1   { font-size: 28px; }
          .proph-bubble     { max-width: 88%; }
          .proph-tip-row    { flex-direction: column; align-items: stretch; gap: 6px; }
        }
      `}</style>

      {/* ── Compact header (chat state only) ── */}
      {!isEmpty ? (
        <div className="proph-bar">
          <div className="proph-mark">
            <span className="fallback" aria-hidden="true">P</span>
            <img
              src="/sneak-peek-elonmusk.svg"
              alt=""
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          </div>
          <div>
            <div className="proph-bar-name">Mr Prophet.</div>
            <div className="proph-bar-status">
              <span className="dot" />
              ONLINE · CONCIERGE
            </div>
          </div>
          <div className="proph-bar-bal">
            <div className="num">{(bustsBalance || 0).toLocaleString()}</div>
            <div className="lbl">YOUR BUSTS</div>
          </div>
          <button
            className="proph-clear"
            onClick={clearHistory}
            title="Clear conversation"
            aria-label="Clear conversation"
            type="button"
          >↺</button>
        </div>
      ) : null}

      {/* ── Empty-state hero ── */}
      {isEmpty ? (
        <div className="proph-empty">
          <div className="proph-empty-mark">
            <span className="fallback" aria-hidden="true">P</span>
            <img
              src="/sneak-peek-elonmusk.svg"
              alt=""
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          </div>
          <div className="proph-empty-kicker">§02 · CONCIERGE · MR PROPHET</div>
          <h2 className="proph-empty-h1">How can Prophet help?</h2>
          <div className="proph-empty-sub">
            Plain English. Real wires. Confirm before anything moves.
          </div>

          <div className="proph-tip">
            <div className="proph-tip-row">
              <span className="proph-tip-badge">TIP</span>
              <button
                type="button"
                className="proph-tip-code"
                onClick={() => tapSuggestion(tip.code)}
                disabled={sending}
                title="Try this"
              >{tip.code}</button>
            </div>
            <div className="proph-tip-note">{tip.note}</div>
          </div>
        </div>
      ) : null}

      {/* ── Thread (chat state only) ── */}
      {!isEmpty ? (
        <div className="proph-body">
          <div className="proph-thread" ref={scrollRef}>
            {msgs.map((m) => (
              <div key={m.id} className={`proph-row ${m.role}`}>
                {m.role === 'bot' ? (
                  <div className="proph-mini-avatar">
                    <span className="proph-mini-avatar-fallback" aria-hidden="true">P</span>
                    <img
                      src="/sneak-peek-elonmusk.svg"
                      alt=""
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                ) : null}
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
                    src="/sneak-peek-elonmusk.svg"
                    alt=""
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>
                <div className="proph-typing"><span /><span /><span /></div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── Input dock (rounded field + circular send) ── */}
      <div className="proph-dock">
        {isEmpty ? (
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
        ) : null}

        <form className="proph-form" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="proph-input"
            placeholder="Ask Prophet anything…"
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
            <span className="proph-send-arrow">↑</span>
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
