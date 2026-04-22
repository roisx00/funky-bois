import { createContext, useContext, useEffect, useReducer, useCallback, useState, useRef } from 'react';
import { ELEMENT_TYPES } from '../data/elements';

// ═══════════════════════════════════════════════════════════════════════════
// THE 1969 — GameContext (server-backed, BUSTS economy)
// ═══════════════════════════════════════════════════════════════════════════

// ─── Session constants (mirror server) ───────────────────────────────────────
const SESSION_INTERVAL_MS    = 60 * 60 * 1000;
const SESSION_WINDOW_MS      = 5 * 60 * 1000;
const MAX_CLAIMS_PER_SESSION = 3;
const DEFAULT_SESSION_POOL_SIZE = 20;

function getCurrentSessionId() {
  return Math.floor(Date.now() / SESSION_INTERVAL_MS) * SESSION_INTERVAL_MS;
}

function deriveSessionStatus(serverStatus, claimsThisSession) {
  const sessId = serverStatus?.sessId ?? getCurrentSessionId();
  const elapsed = Date.now() - sessId;
  const totalPool       = serverStatus?.poolSize       ?? DEFAULT_SESSION_POOL_SIZE;
  const poolClaimed     = serverStatus?.poolClaimed    ?? 0;
  const poolRemaining   = serverStatus?.poolRemaining  ?? Math.max(0, totalPool - poolClaimed);
  const isPoolEmpty     = poolRemaining <= 0;
  const isActive        = (serverStatus?.isActive ?? (elapsed < SESSION_WINDOW_MS)) && !isPoolEmpty;
  return {
    sessId,
    isActive,
    isPoolEmpty,
    msUntilNext:  Math.max(0, SESSION_INTERVAL_MS - elapsed),
    msUntilClose: Math.max(0, SESSION_WINDOW_MS - elapsed),
    simClaimed:   poolClaimed,
    poolRemaining,
    poolPct:      poolRemaining / totalPool,
    totalPool,
    claimsThisSession,
    canClaimThisSession: claimsThisSession < MAX_CLAIMS_PER_SESSION,
    maxClaims: MAX_CLAIMS_PER_SESSION,
  };
}

export function simulateNFTCount() {
  const LAUNCH_MS = 1735689600000;
  const hours = Math.max(0, (Date.now() - LAUNCH_MS) / 3600000);
  return Math.min(1969, Math.floor(100 + hours * 0.45));
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
    pendingGifts:    [],
    pendingInbox:    [],
    referralCode:    null,
    referralCount:   0,
    isAdmin:         false,
    sessionStatus:   deriveSessionStatus(null, 0),
    serverDropStatus: null,
    mySessionClaims: 0,
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
        referralCode:     me.user.referralCode,
        isAdmin:          me.user.isAdmin,
        bustsHistory:     me.bustsHistory,
        inventory:        me.inventory,
        completedNFTs:    me.completedNFTs,
        pendingInbox:     me.pendingGifts,
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
      return { ...state, completedNFTs: [action.nft, ...state.completedNFTs] };
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

    case 'REMOVE_INBOX_GIFT':
      return { ...state, pendingInbox: state.pendingInbox.filter((g) => g.id !== action.giftId) };

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
      }
      const ds = await jget('/api/drop-status');
      if (!cancelled && ds.ok) dispatch({ type: 'SET_DROP_STATUS', payload: ds });
    })();
    return () => { cancelled = true; };
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

  const claimElement = useCallback(async () => {
    if (!state.authenticated) return { ok: false, reason: 'Sign in with X first' };
    const r = await jpost('/api/drop-claim');
    if (!r.ok) return { ok: false, reason: r.error || 'Drop claim failed' };
    dispatch({ type: 'ADD_INVENTORY', element: r.element });
    dispatch({ type: 'BUMP_BALANCE', amount: r.bustsReward, reason: `Drop reward: ${r.element.name}` });
    if (r.dailyBonus) dispatch({ type: 'BUMP_BALANCE', amount: r.dailyBonus, reason: 'Daily drop claim' });
    dispatch({ type: 'BUMP_SESSION_CLAIMS' });
    // Re-pull status so pool counter is in sync
    jget('/api/drop-status').then((ds) => ds.ok && dispatch({ type: 'SET_DROP_STATUS', payload: ds }));
    return { ok: true, element: r.element, bustsReward: r.bustsReward, position: r.position };
  }, [state.authenticated]);

  const openMysteryBox = useCallback(async (tier) => {
    if (!state.authenticated) return { ok: false, reason: 'Sign in with X first' };
    const r = await jpost('/api/box-open', { tier });
    if (!r.ok) return { ok: false, reason: r.error || 'Box open failed' };
    dispatch({ type: 'ADD_INVENTORY', element: r.element });
    dispatch({ type: 'BUMP_BALANCE', amount: -(state.bustsBalance - r.newBalance), reason: `Opened ${tier} box` });
    return { ok: true, element: r.element, newBalance: r.newBalance };
  }, [state.authenticated, state.bustsBalance]);

  const sendGift = useCallback(async (toXUsername, element) => {
    const r = await jpost('/api/gift/send', { toXUsername, elementType: element.type, variant: element.variant });
    if (!r.ok) return { ok: false, reason: r.error || 'Gift failed' };
    dispatch({ type: 'REMOVE_INVENTORY', elementType: element.type, variant: element.variant });
    return { ok: true, giftId: r.giftId, recipient: r.recipient };
  }, []);

  const claimGift = useCallback(async (giftId) => {
    const r = await jpost('/api/gift/claim', { giftId });
    if (!r.ok) return { ok: false, reason: r.error || 'Claim failed' };
    dispatch({ type: 'ADD_INVENTORY', element: r.element });
    dispatch({ type: 'REMOVE_INBOX_GIFT', giftId });
    return { ok: true, element: r.element };
  }, []);

  const checkUserExists = useCallback(async (username) => {
    const r = await jget(`/api/users/exists?username=${encodeURIComponent(username)}`);
    if (!r.ok) return false;
    return !!r.exists;
  }, []);

  const submitPortrait = useCallback(async (elements) => {
    const r = await jpost('/api/portrait/submit', { elements });
    if (!r.ok) return { ok: false, reason: r.error || 'Submit failed' };
    dispatch({
      type: 'ADD_COMPLETED',
      nft: { id: r.id, elements, shareHash: r.shareHash, sharedToX: false, createdAt: Date.now() },
    });
    return { ok: true, id: r.id, shareHash: r.shareHash };
  }, []);

  const sharePortrait = useCallback(async (portraitId, tweetUrl) => {
    const r = await jpost('/api/portrait/share', { portraitId, tweetUrl });
    if (r.ok && r.credited) {
      dispatch({ type: 'MARK_NFT_SHARED', nftId: portraitId, tweetUrl });
      dispatch({ type: 'BUMP_BALANCE', amount: 200, reason: 'Shared portrait on X' });
    }
    return r;
  }, []);

  const recordWhitelist = useCallback(async ({ walletAddress, portraitId }) => {
    const r = await jpost('/api/whitelist/record', { walletAddress, portraitId });
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
    checkUserExists,
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
