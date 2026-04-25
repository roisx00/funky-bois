import { createContext, useContext, useEffect, useReducer, useCallback, useState, useRef } from 'react';
import { ELEMENT_TYPES } from '../data/elements';
import { useToast } from '../components/Toast';

// ═══════════════════════════════════════════════════════════════════════════
// THE 1969 — GameContext (server-backed, BUSTS economy)
// ═══════════════════════════════════════════════════════════════════════════

// ─── Session constants (mirror server) ───────────────────────────────────────
const SESSION_INTERVAL_MS    = 2 * 60 * 60 * 1000;
const SESSION_WINDOW_MS      = 5 * 60 * 1000;
// Mirrors api/_lib/elements.js — keep in sync. One claim per user
// per 2-hour session in the pre-whitelist model.
const MAX_CLAIMS_PER_SESSION = 1;

function getCurrentSessionId() {
  return Math.floor(Date.now() / SESSION_INTERVAL_MS) * SESSION_INTERVAL_MS;
}

function deriveSessionStatus(serverStatus, claimsThisSession) {
  const sessId = serverStatus?.sessId ?? getCurrentSessionId();
  const elapsed = Date.now() - sessId;
  // Server intentionally hides raw pool counts from the public response.
  // We only get a mood label + percentage. Admin responses additionally
  // expose raw numbers under `admin` — we surface those for the admin UI.
  const poolState   = serverStatus?.poolState ?? 'stocked';
  const poolPct     = typeof serverStatus?.poolPct === 'number' ? serverStatus.poolPct : 1;
  const isPoolEmpty = poolState === 'sealed' || poolPct <= 0;
  const isActive    = (serverStatus?.isActive ?? (elapsed < SESSION_WINDOW_MS)) && !isPoolEmpty;
  return {
    sessId,
    isActive,
    isPoolEmpty,
    msUntilNext:  Math.max(0, SESSION_INTERVAL_MS - elapsed),
    msUntilClose: Math.max(0, SESSION_WINDOW_MS - elapsed),
    poolState,     // 'stocked' | 'flowing' | 'thinning' | 'low' | 'sealed'
    poolPct,       // 0..1 (for the meter bar, no raw numbers)
    admin:        serverStatus?.admin ?? null, // raw {poolSize, poolClaimed, poolRemaining} — admins only
    claimsThisSession,
    canClaimThisSession: claimsThisSession < MAX_CLAIMS_PER_SESSION,
    maxClaims: MAX_CLAIMS_PER_SESSION,
  };
}

// DEPRECATED fake-progress simulator kept only so any legacy callers
// don't crash. Landing page now reads the REAL count from
// /api/drop-status via useLivePortraitCount() below.
export function simulateNFTCount() { return 0; }

// Convenience: pull the authoritative portrait count from drop-status
// on the landing page. Polls every 30s so long-open tabs stay current.
export function useLivePortraitCount() {
  const game = useGame();
  return {
    portraitsBuilt: game.portraitsBuilt || 0,
    supplyCap:      game.supplyCap || 1969,
  };
}

// ─── State shape (server-hydrated, with offline cache fallback) ─────────────
function emptyState() {
  return {
    hydrated:        false,
    authenticated:   false,
    userId:          null,
    xUser:           null, // { id, username, name, avatar }
    walletAddress:   null,
    isWalletConnected: false,
    bustsBalance:    0,
    bustsHistory:    [],
    inventory:       [],
    completedNFTs:   [],
    isWhitelisted:   false,
    followClaimedAt: null,
    pendingGifts:    [],
    pendingInbox:    [],
    pendingBustsTransfers: [],
    referralCode:    null,
    referralCount:   0,
    isAdmin:         false,
    suspended:       false,
    dropEligible:    false,
    preWhitelist:    null,        // { id, status, message, adminNote, createdAt, updatedAt } | null
    sessionStatus:   deriveSessionStatus(null, 0),
    serverDropStatus: null,
    mySessionClaims: 0,
    portraitsBuilt:   0,
    supplyCap:        1969,
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'HYDRATE': {
      const me = action.payload;
      if (!me?.authenticated) {
        return { ...emptyState(), hydrated: true, authenticated: false };
      }
      return {
        ...state,
        hydrated: true,
        authenticated: true,
        userId: me.user.id,
        xUser: {
          id:       me.user.id,
          username: me.user.xUsername,
          name:     me.user.xName,
          avatar:   me.user.xAvatar,
        },
        walletAddress:    me.user.walletAddress || null,
        isWalletConnected: !!me.user.walletAddress,
        bustsBalance:     me.user.bustsBalance,
        isWhitelisted:    me.user.isWhitelisted,
        followClaimedAt:  me.user.followClaimedAt || null,
        referralCode:     me.user.referralCode,
        isAdmin:          me.user.isAdmin,
        suspended:        me.user.suspended === true,
        dropEligible:     me.user.dropEligible === true,
        preWhitelist:     me.preWhitelist || null,
        bustsHistory:     me.bustsHistory,
        inventory:        me.inventory,
        completedNFTs:    me.completedNFTs,
        pendingGifts:     me.pendingGifts || [],
        pendingInbox:     me.pendingGifts || [], // legacy alias
        pendingBustsTransfers: me.pendingBustsTransfers || [],
      };
    }

    case 'CLEAR_USER':
      return { ...emptyState(), hydrated: true };

    case 'SET_DROP_STATUS': {
      const s = action.payload;
      return {
        ...state,
        serverDropStatus: s,
        mySessionClaims:  s?.mySessionClaims ?? state.mySessionClaims,
        sessionStatus:    deriveSessionStatus(s, s?.mySessionClaims ?? state.mySessionClaims),
        portraitsBuilt:   typeof s?.portraitsBuilt === 'number' ? s.portraitsBuilt : state.portraitsBuilt,
        supplyCap:        typeof s?.supplyCap      === 'number' ? s.supplyCap      : state.supplyCap,
      };
    }

    case 'BUMP_BALANCE': {
      const entry = { amount: action.amount, reason: action.reason || 'Reward', ts: Date.now() };
      return {
        ...state,
        bustsBalance: Math.max(0, state.bustsBalance + action.amount),
        bustsHistory: [entry, ...state.bustsHistory.slice(0, 49)],
      };
    }

    case 'ADD_INVENTORY': {
      const el = action.element;
      const existing = state.inventory.find((i) => i.type === el.type && i.variant === el.variant);
      const inventory = existing
        ? state.inventory.map((i) => (i === existing ? { ...i, quantity: (i.quantity || 1) + 1 } : i))
        : [...state.inventory, { type: el.type, variant: el.variant, name: el.name, rarity: el.rarity, quantity: 1, obtainedAt: Date.now() }];
      return { ...state, inventory };
    }

    case 'REMOVE_INVENTORY': {
      const idx = state.inventory.findIndex((i) => i.type === action.elementType && i.variant === action.variant);
      if (idx === -1) return state;
      const item = state.inventory[idx];
      const next = (item.quantity || 1) <= 1
        ? state.inventory.filter((_, i) => i !== idx)
        : state.inventory.map((i, k) => (k === idx ? { ...i, quantity: i.quantity - 1 } : i));
      return { ...state, inventory: next };
    }

    case 'BUMP_SESSION_CLAIMS': {
      const next = state.mySessionClaims + 1;
      return {
        ...state,
        mySessionClaims: next,
        sessionStatus: deriveSessionStatus(state.serverDropStatus, next),
      };
    }

    case 'ADD_COMPLETED': {
      // Auto-whitelist the moment a portrait is built — server does the
      // same on its side. Dashboard badge flips to WL without a refetch.
      return {
        ...state,
        completedNFTs: [action.nft, ...state.completedNFTs],
        isWhitelisted: true,
      };
    }

    case 'MARK_NFT_SHARED': {
      return {
        ...state,
        completedNFTs: state.completedNFTs.map((n) =>
          n.id === action.nftId ? { ...n, sharedToX: true, tweetUrl: action.tweetUrl || n.tweetUrl } : n
        ),
        isWhitelisted: true,
      };
    }

    case 'MARK_FOLLOW_CLAIMED':
      return { ...state, followClaimedAt: action.ts || Date.now() };

    case 'REMOVE_INBOX_GIFT':
      return {
        ...state,
        pendingGifts: state.pendingGifts.filter((g) => g.id !== action.giftId),
        pendingInbox: state.pendingInbox.filter((g) => g.id !== action.giftId),
      };

    case 'REMOVE_BUSTS_TRANSFER':
      return {
        ...state,
        pendingBustsTransfers: state.pendingBustsTransfers.filter(
          (t) => t.id !== action.transferId
        ),
      };

    case 'SET_WALLET':
      return { ...state, walletAddress: action.address || null, isWalletConnected: !!action.address };

    case 'SET_X_USER': {
      // After successful sign-in callback
      if (!action.user) return state;
      return {
        ...state,
        xUser: {
          id: action.user.id,
          username: action.user.xUsername,
          name: action.user.xName,
          avatar: action.user.xAvatar,
        },
        userId: action.user.id,
        bustsBalance: action.user.bustsBalance ?? state.bustsBalance,
        isWhitelisted: action.user.isWhitelisted ?? state.isWhitelisted,
        authenticated: true,
        hydrated: true,
      };
    }

    default:
      return state;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Provider
// ═══════════════════════════════════════════════════════════════════════════

const GameContext = createContext(null);

async function jpost(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!r.ok) return { ok: false, status: r.status, ...data };
  return { ok: true, ...data };
}

async function jget(path) {
  const r = await fetch(path, { credentials: 'same-origin' });
  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!r.ok) return { ok: false, status: r.status, ...data };
  return { ok: true, ...data };
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, emptyState);
  const dropPollRef = useRef(null);
  const mePollRef   = useRef(null);
  const toast = useToast();

  // Set of pending BUSTS transfer IDs we've already told the user about,
  // so a 30s re-poll doesn't re-toast the same incoming transfer.
  const seenTransferIdsRef = useRef(null);

  function announceNewTransfers(nextList) {
    const next = Array.isArray(nextList) ? nextList : [];
    if (seenTransferIdsRef.current === null) {
      // First observation — prime the set silently. Otherwise every
      // reload of a logged-in session would re-toast stale inbox items.
      seenTransferIdsRef.current = new Set(next.map((t) => t.id));
      return;
    }
    for (const t of next) {
      if (!seenTransferIdsRef.current.has(t.id)) {
        seenTransferIdsRef.current.add(t.id);
        const from = t.fromXUsername ? '@' + t.fromXUsername : 'someone';
        toast.success(`${from} sent you ${Number(t.amount).toLocaleString()} BUSTS · claim from inbox`);
      }
    }
    // Also drop IDs that have disappeared (claimed/expired) from the set
    // so the memory doesn't grow forever over a long session.
    const stillPending = new Set(next.map((t) => t.id));
    for (const id of Array.from(seenTransferIdsRef.current)) {
      if (!stillPending.has(id)) seenTransferIdsRef.current.delete(id);
    }
  }

  // Initial hydrate. Skipped when an OAuth callback is in progress
  // (?code=...) because handleXCallback() will fire and set the session
  // cookie a moment later — racing /api/me now would latch a false-negative
  // authenticated:false that overwrites the good state once the callback
  // completes.
  useEffect(() => {
    const hasOAuthCode = typeof window !== 'undefined' && window.location.search.includes('code=');
    let cancelled = false;
    (async () => {
      if (!hasOAuthCode) {
        const me = await jget('/api/me');
        if (cancelled) return;
        dispatch({ type: 'HYDRATE', payload: me.ok ? me : { authenticated: false } });
        if (me.ok) announceNewTransfers(me.pendingBustsTransfers);
      }
      const ds = await jget('/api/drop-status');
      if (!cancelled && ds.ok) dispatch({ type: 'SET_DROP_STATUS', payload: ds });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll drop status every 15s while page is open
  useEffect(() => {
    function tick() {
      jget('/api/drop-status').then((ds) => {
        if (ds.ok) dispatch({ type: 'SET_DROP_STATUS', payload: ds });
      });
    }
    dropPollRef.current = setInterval(tick, 15000);
    return () => clearInterval(dropPollRef.current);
  }, []);

  // Poll /api/me every 30s so an idle recipient sees newly arrived
  // pending BUSTS transfers without manually refreshing. Also catches
  // balance drifts (spends/rewards from other devices, etc.).
  useEffect(() => {
    function tick() {
      jget('/api/me').then((me) => {
        if (!me || !me.ok || !me.authenticated) return;
        dispatch({ type: 'HYDRATE', payload: me });
        announceNewTransfers(me.pendingBustsTransfers);
      }).catch(() => {});
    }
    mePollRef.current = setInterval(tick, 30000);
    return () => clearInterval(mePollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render every second so timers update
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Recompute sessionStatus from server data + tick
  const sessionStatus = deriveSessionStatus(state.serverDropStatus, state.mySessionClaims);

  // ── Derived ──
  const uniqueTypesOwned = ELEMENT_TYPES.filter((type) => state.inventory.some((i) => i.type === type));
  const progressCount = uniqueTypesOwned.length;
  const hasAllTypes   = progressCount === ELEMENT_TYPES.length;

  // ── Actions ──
  const refreshMe = useCallback(async () => {
    const me = await jget('/api/me');
    dispatch({ type: 'HYDRATE', payload: me.ok ? me : { authenticated: false } });
  }, []);

  const loginWithX = useCallback(async (user) => {
    // Called from App.jsx after X OAuth callback succeeds.
    dispatch({ type: 'SET_X_USER', user });
    // Fully rehydrate from server so balance, inventory, etc. are populated.
    await refreshMe();
    const ds = await jget('/api/drop-status');
    if (ds.ok) dispatch({ type: 'SET_DROP_STATUS', payload: ds });
  }, [refreshMe]);

  const logoutX = useCallback(async () => {
    try { await fetch('/api/sign-out', { method: 'POST', credentials: 'same-origin' }); } catch { /* ignore */ }
    dispatch({ type: 'CLEAR_USER' });
  }, []);

  // Drop claim — single click. No captcha, no arm token, no jitter.
  // Pre-whitelist is the only gate: admin-approved users only.
  // One claim per user per session.
  const claimElement = useCallback(async () => {
    if (!state.authenticated) return { ok: false, reason: 'Sign in with X first' };
    const r = await jpost('/api/drop-claim');
    if (!r.ok) return { ok: false, reason: r.error || 'Drop claim failed', ...r };
    dispatch({ type: 'ADD_INVENTORY', element: r.element });
    dispatch({ type: 'BUMP_BALANCE', amount: r.bustsReward, reason: `Drop reward: ${r.element.name}` });
    if (r.dailyBonus) dispatch({ type: 'BUMP_BALANCE', amount: r.dailyBonus, reason: 'Daily drop claim' });
    dispatch({ type: 'BUMP_SESSION_CLAIMS' });
    jget('/api/drop-status').then((ds) => ds.ok && dispatch({ type: 'SET_DROP_STATUS', payload: ds }));
    return { ok: true, element: r.element, bustsReward: r.bustsReward, position: r.position };
  }, [state.authenticated]);

  // Submit (or re-submit) a pre-whitelist application for the drop.
  const applyForDrop = useCallback(async (message) => {
    if (!state.authenticated) return { ok: false, reason: 'Sign in with X first' };
    const r = await jpost('/api/pre-whitelist-apply', { message: message || '' });
    if (!r.ok) return { ok: false, reason: r.error || 'apply_failed', ...r };
    refreshMe();
    return { ok: true, status: r.status, alreadyApproved: !!r.alreadyApproved };
  }, [state.authenticated, refreshMe]);

  // Back-compat shim: the old DropPage state machine called armDrop.
  // It's a no-op now; the new DropPage doesn't use it.
  const armDrop = useCallback(async () => ({ ok: true }), []);

  const openMysteryBox = useCallback(async (tier) => {
    if (!state.authenticated) return { ok: false, reason: 'Sign in with X first' };
    const r = await jpost('/api/box-open', { tier });
    if (!r.ok) {
      if (r.error === 'min_followers_not_met') {
        const need = Number(r.required) || 20;
        const have = Number(r.have) || 0;
        return {
          ok: false,
          reason: `Mystery boxes require at least ${need} followers on X. Your account currently has ${have}. Grow your X account, then try again.`,
        };
      }
      if (r.error === 'insufficient_busts') {
        return { ok: false, reason: 'Not enough BUSTS for this tier.' };
      }
      return { ok: false, reason: r.error || 'Box open failed' };
    }
    dispatch({ type: 'ADD_INVENTORY', element: r.element });
    dispatch({ type: 'BUMP_BALANCE', amount: -(state.bustsBalance - r.newBalance), reason: `Opened ${tier} box` });
    return { ok: true, element: r.element, newBalance: r.newBalance };
  }, [state.authenticated, state.bustsBalance]);

  const sendGift = useCallback(async (toXUsername, element) => {
    const r = await jpost('/api/gift-send', { toXUsername, elementType: element.type, variant: element.variant });
    if (!r.ok) {
      console.error('[sendGift] server rejected:', r);
      return { ok: false, reason: r.error || r.message || `HTTP ${r.status || '?'}`, status: r.status, raw: r };
    }
    dispatch({ type: 'REMOVE_INVENTORY', elementType: element.type, variant: element.variant });
    return { ok: true, giftId: r.giftId, recipient: r.recipient };
  }, []);

  const claimGift = useCallback(async (giftId) => {
    const r = await jpost('/api/gift-claim', { giftId });
    if (!r.ok) return { ok: false, reason: r.error || 'Claim failed' };
    dispatch({ type: 'ADD_INVENTORY', element: r.element });
    dispatch({ type: 'REMOVE_INBOX_GIFT', giftId });
    return { ok: true, element: r.element };
  }, []);

  const sendBusts = useCallback(async (toXUsername, amount) => {
    const r = await jpost('/api/busts-send', { toXUsername, amount });
    if (!r.ok) return { ok: false, reason: r.error || r.message || 'BUSTS send failed', status: r.status };
    // Server already deducted; mirror locally and append a ledger row.
    dispatch({ type: 'BUMP_BALANCE', amount: -Number(r.amount), reason: `Sent ${r.amount} BUSTS to @${r.recipient}` });
    return {
      ok: true,
      amount:   Number(r.amount),
      recipient: r.recipient,
      delivered: !!r.delivered,      // true if recipient exists; false → pending
      transferId: r.transferId || null,
    };
  }, []);

  const claimBustsTransfer = useCallback(async (transferId) => {
    const r = await jpost('/api/busts-claim', { transferId });
    if (!r.ok) return { ok: false, reason: r.error || 'Claim failed' };
    dispatch({ type: 'BUMP_BALANCE', amount: Number(r.amount), reason: `Received ${r.amount} BUSTS from @${r.fromXUsername}` });
    dispatch({ type: 'REMOVE_BUSTS_TRANSFER', transferId });
    return { ok: true, amount: Number(r.amount), fromXUsername: r.fromXUsername };
  }, []);

  const claimFollow = useCallback(async () => {
    const r = await jpost('/api/task-follow-claim');
    if (!r.ok) {
      if (r.error === 'min_followers_not_met') {
        const need = Number(r.required) || 20;
        const have = Number(r.have) || 0;
        return {
          ok: false,
          reason: `Follow reward requires at least ${need} followers on X. You have ${have}.`,
        };
      }
      return { ok: false, reason: r.error || 'follow claim failed' };
    }
    if (r.claimed) {
      dispatch({ type: 'MARK_FOLLOW_CLAIMED', ts: r.claimedAt ? new Date(r.claimedAt).getTime() : Date.now() });
      if (r.reward) dispatch({ type: 'BUMP_BALANCE', amount: r.reward, reason: 'Followed @the1969eth' });
    } else if (r.already_claimed) {
      dispatch({ type: 'MARK_FOLLOW_CLAIMED', ts: Date.now() });
    }
    return { ok: true, reward: r.reward || 0, alreadyClaimed: !!r.already_claimed };
  }, []);

  const checkUserExists = useCallback(async (username) => {
    const r = await jget(`/api/users-exists?username=${encodeURIComponent(username)}`);
    if (!r.ok) return false;
    return !!r.exists;
  }, []);

  const submitPortrait = useCallback(async (elements) => {
    const r = await jpost('/api/portrait-submit', { elements });
    if (!r.ok) return { ok: false, reason: r.error || 'Submit failed' };
    dispatch({
      type: 'ADD_COMPLETED',
      nft: { id: r.id, elements, shareHash: r.shareHash, sharedToX: false, createdAt: Date.now() },
    });
    // Server consumed the 8 traits atomically — mirror that in local
    // inventory state so the UI (Gift tab, Build picker) updates
    // instantly without waiting for a /api/me refetch.
    if (Array.isArray(r.consumed)) {
      for (const c of r.consumed) {
        dispatch({ type: 'REMOVE_INVENTORY', elementType: c.type, variant: c.variant });
      }
    }
    return { ok: true, id: r.id, shareHash: r.shareHash };
  }, []);

  const sharePortrait = useCallback(async (portraitId, tweetUrl) => {
    const r = await jpost('/api/portrait-share', { portraitId, tweetUrl });
    if (r.ok && r.credited) {
      dispatch({ type: 'MARK_NFT_SHARED', nftId: portraitId, tweetUrl });
      dispatch({ type: 'BUMP_BALANCE', amount: 200, reason: 'Shared portrait on X' });
    }
    return r;
  }, []);

  const recordWhitelist = useCallback(async ({ walletAddress, portraitId, signature }) => {
    if (!signature) {
      return { ok: false, reason: 'signature_required' };
    }
    const r = await jpost('/api/whitelist-record', { walletAddress, portraitId, signature });
    if (r.ok) {
      dispatch({ type: 'SET_WALLET', address: walletAddress });
      refreshMe();
    }
    return r;
  }, [refreshMe]);

  // Wallet bridge: WalletBridge dispatches address into context
  const bridgeWallet = useCallback((address) => {
    dispatch({ type: 'SET_WALLET', address });
  }, []);
  const disconnectWallet = useCallback(() => {
    dispatch({ type: 'SET_WALLET', address: null });
  }, []);
  // No-op: kept for backward-compat with old call sites
  const connectWallet = useCallback(async () => ({ ok: false, reason: 'Use the Connect button (RainbowKit)' }), []);

  // Compatibility shims for code that hasn't been updated yet
  const completeNFT      = useCallback((elements) => submitPortrait(elements), [submitPortrait]);
  const markShared       = useCallback((nftId, tweetUrl) => sharePortrait(nftId, tweetUrl), [sharePortrait]);
  const addBusts         = useCallback(() => { /* server-driven now */ }, []);
  const spendBusts       = useCallback(() => { /* server-driven now */ }, []);
  const setReferredBy    = useCallback(() => { /* handled at OAuth callback time */ }, []);
  const setUsername      = useCallback(() => { /* server-driven */ }, []);
  const earnReferralBonus = useCallback(() => { /* server-driven via /api/x-token referral */ }, []);
  const addGiftedElement = useCallback((element) => dispatch({ type: 'ADD_INVENTORY', element }), []);
  const removeElement    = useCallback((elementType, variant) => dispatch({ type: 'REMOVE_INVENTORY', elementType, variant }), []);
  const claimConsolation = useCallback(() => ({ ok: false, reason: 'Consolation moved to backend' }), []);
  const setReferralCode  = useCallback(() => { /* code is the X username, set server-side */ }, []);
  const setAdmin         = useCallback(() => { /* admin status is read from /api/me */ }, []);
  const setDropPoolSize  = useCallback(() => { /* admin-only via separate endpoint, TBD */ }, []);

  const resetProgress = useCallback(async () => {
    await logoutX();
    window.location.reload();
  }, [logoutX]);

  // Compatibility flags exposed to UI
  const hasConsolation = false;
  const canClaimDaily  = state.authenticated; // server tracks date

  // Convenience: legacy whitelistRoster (now server-authoritative; admin pulls from API)
  const whitelistRoster = state.completedNFTs.filter((n) => n.sharedToX).map((n) => ({
    xUsername: state.xUser?.username,
    walletAddress: state.walletAddress,
    portraitId: n.id,
    portraitElements: n.elements,
    tweetUrl: n.tweetUrl,
    claimedAt: n.createdAt,
  }));

  const value = {
    ...state,
    sessionStatus,
    progressCount,
    hasAllTypes,
    uniqueTypesOwned,
    hasConsolation,
    canClaimDaily,
    whitelistRoster,
    refreshMe,
    loginWithX,
    logoutX,
    connectWallet,
    bridgeWallet,
    disconnectWallet,
    setReferralCode,
    setReferredBy,
    claimElement,
    armDrop,
    applyForDrop,
    openMysteryBox,
    claimConsolation,
    addBusts,
    spendBusts,
    completeNFT,
    submitPortrait,
    markShared,
    sharePortrait,
    recordWhitelist,
    removeElement,
    addGiftedElement,
    sendGift,
    claimGift,
    sendBusts,
    claimBustsTransfer,
    checkUserExists,
    claimFollow,
    earnReferralBonus,
    resetProgress,
    setUsername,
    setAdmin,
    setDropPoolSize,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
