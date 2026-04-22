import { createContext, useContext, useEffect, useReducer, useCallback, useState } from 'react';
import { ELEMENT_TYPES, pickRandomElement } from '../data/elements';

// ═══════════════════════════════════════════════════════════════════════════
// THE 1969 / GameContext (off-chain, BUSTS economy)
// ═══════════════════════════════════════════════════════════════════════════

// ─── Session constants ──────────────────────────────────────────────────────
const SESSION_INTERVAL_MS    = 60 * 60 * 1000;
const SESSION_WINDOW_MS      = 5 * 60 * 1000;
const MAX_CLAIMS_PER_SESSION = 3;
const DEFAULT_SESSION_POOL_SIZE = 20;

function simulateOtherClaims(sessionStartMs) {
  const elapsedSec = Math.max(0, (Date.now() - sessionStartMs) / 1000);
  const t = Math.min(elapsedSec / (SESSION_WINDOW_MS / 1000), 1);
  return Math.floor(Math.pow(t, 0.45) * 18);
}

function getCurrentSessionId() {
  return Math.floor(Date.now() / SESSION_INTERVAL_MS) * SESSION_INTERVAL_MS;
}

function getSessionStatus(poolSize = DEFAULT_SESSION_POOL_SIZE) {
  const now     = Date.now();
  const sessId  = getCurrentSessionId();
  const elapsed = now - sessId;
  const isActive      = elapsed < SESSION_WINDOW_MS;
  const msUntilNext   = SESSION_INTERVAL_MS - elapsed;
  const msUntilClose  = isActive ? SESSION_WINDOW_MS - elapsed : 0;
  const simClaimed    = isActive ? simulateOtherClaims(sessId) : poolSize;
  const poolRemaining = Math.max(0, poolSize - simClaimed);
  const poolPct       = poolRemaining / poolSize;
  const poolEmpty     = poolRemaining <= 0;

  return {
    sessId,
    isActive: isActive && !poolEmpty,
    isPoolEmpty: poolEmpty,
    msUntilNext,
    msUntilClose,
    simClaimed,
    poolRemaining,
    poolPct,
    totalPool: poolSize,
  };
}

// ─── Wallet username derivation ─────────────────────────────────────────────
const ADJECTIVES = ['Shadow','Silent','Stoic','Grim','Vintage','Noble','Bleak','Raw','Iron','Marble','Obsidian','Paper','Ashen','Frost','Velvet'];
const NOUNS      = ['Boi','Shade','Saint','Monk','Bust','Ghost','Warden','Patron','Rogue','Witness','Stranger','Prophet','Deacon','Muse','Heir'];

function deriveWalletUsername(addr) {
  const hex  = addr.replace('0x', '').toLowerCase().padEnd(8, '0');
  const adj  = ADJECTIVES[parseInt(hex.slice(0, 2), 16) % ADJECTIVES.length];
  const noun = NOUNS[parseInt(hex.slice(2, 4), 16) % NOUNS.length];
  const num  = parseInt(hex.slice(4, 8), 16) % 10000;
  return `${adj}${noun}${num.toString().padStart(4, '0')}`;
}

// ─── BUSTS reward table (drop claims) ────────────────────────────────────────
const DROP_BUSTS_REWARD = { common: 5, rare: 15, legendary: 30, ultra_rare: 100 };
const DAILY_CLAIM_BONUS = 25;
const REFERRAL_BUSTS    = 50;
const SHARE_NFT_BUSTS   = 200;

// ─── NFT count simulation (toward 1,969 supply) ──────────────────────────────
export function simulateNFTCount() {
  const LAUNCH_MS = 1735689600000; // Jan 1 2026 UTC
  const hours = Math.max(0, (Date.now() - LAUNCH_MS) / 3600000);
  return Math.min(1969, Math.floor(100 + hours * 0.45));
}

// ═══════════════════════════════════════════════════════════════════════════
// State + reducer
// ═══════════════════════════════════════════════════════════════════════════

function makeInitialState() {
  return {
    userId:              crypto.randomUUID(),
    username:            null,
    xUser:               null,
    walletAddress:       null,
    walletUsername:      null,
    isWalletConnected:   false,
    bustsBalance:        50,
    bustsHistory:        [],          // [{ amount, reason, ts }]
    dailyClaimedOn:      null,        // YYYY-MM-DD string of last claim
    claimedConsolations: {},
    inventory:           [],
    completedNFTs:       [],
    isWhitelisted:       false,
    claimedSessions:     {},
    pendingGifts:        [],          // [{ id, from, toXUsername, element, ts, claimed }]
    referralCode:        null,
    referredBy:          null,
    referralCount:       0,
    isAdmin:             false,
    dropPoolSize:        DEFAULT_SESSION_POOL_SIZE,
  };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_USERNAME':
      return { ...state, username: action.username };

    case 'SET_X_USER':
      return { ...state, xUser: action.user, username: action.user.username };

    case 'CLEAR_X_USER':
      return { ...state, xUser: null, username: state.walletUsername || null };

    case 'CONNECT_WALLET': {
      const uname = deriveWalletUsername(action.address);
      return {
        ...state,
        walletAddress:     action.address,
        walletUsername:    uname,
        isWalletConnected: true,
        username:          state.xUser?.username || uname,
      };
    }

    case 'DISCONNECT_WALLET':
      return { ...state, walletAddress: null, walletUsername: null, isWalletConnected: false };

    case 'SET_REFERRAL_CODE':
      if (state.referralCode) return state;
      return { ...state, referralCode: action.code };

    case 'SET_REFERRED_BY': {
      if (state.referredBy) return state;
      const refEntry = { amount: REFERRAL_BUSTS, reason: 'Referral join bonus', ts: Date.now() };
      return {
        ...state,
        referredBy: action.code,
        bustsBalance: state.bustsBalance + REFERRAL_BUSTS,
        bustsHistory: [refEntry, ...state.bustsHistory.slice(0, 49)],
      };
    }

    case 'ADD_ELEMENT': {
      const el       = action.element;
      const existing = state.inventory.find(
        (i) => i.type === el.type && i.variant === el.variant
      );
      if (existing) {
        return {
          ...state,
          inventory: state.inventory.map((i) =>
            i === existing ? { ...i, quantity: (i.quantity || 1) + 1 } : i
          ),
        };
      }
      return {
        ...state,
        inventory: [
          ...state.inventory,
          { ...el, id: crypto.randomUUID(), quantity: 1, obtainedAt: Date.now() },
        ],
      };
    }

    case 'REMOVE_ELEMENT': {
      const idx = state.inventory.findIndex(
        (i) => i.type === action.elementType && i.variant === action.variant
      );
      if (idx === -1) return state;
      const item = state.inventory[idx];
      if ((item.quantity || 1) <= 1) {
        return { ...state, inventory: state.inventory.filter((_, i) => i !== idx) };
      }
      return {
        ...state,
        inventory: state.inventory.map((i, index) =>
          index === idx ? { ...i, quantity: i.quantity - 1 } : i
        ),
      };
    }

    case 'RECORD_SESSION_CLAIM': {
      const { sessionId, position, firstClaim } = action;
      const prev = state.claimedSessions[sessionId] || { count: 0, positions: [], firstClaimMs: null };
      return {
        ...state,
        claimedSessions: {
          ...state.claimedSessions,
          [sessionId]: {
            count:        prev.count + 1,
            positions:    [...prev.positions, position],
            firstClaimMs: prev.firstClaimMs ?? firstClaim,
          },
        },
      };
    }

    case 'ADD_BUSTS': {
      const entry = { amount: action.amount, reason: action.reason || 'Reward', ts: Date.now() };
      return {
        ...state,
        bustsBalance: state.bustsBalance + action.amount,
        bustsHistory: [entry, ...state.bustsHistory.slice(0, 49)],
      };
    }

    case 'SPEND_BUSTS': {
      if (state.bustsBalance < action.amount) return state;
      const entry = { amount: -action.amount, reason: action.reason || 'Spent', ts: Date.now() };
      return {
        ...state,
        bustsBalance: state.bustsBalance - action.amount,
        bustsHistory: [entry, ...state.bustsHistory.slice(0, 49)],
      };
    }

    case 'CLAIM_DAILY': {
      const day = todayKey();
      if (state.dailyClaimedOn === day) return state;
      const entry = { amount: DAILY_CLAIM_BONUS, reason: 'Daily drop claim', ts: Date.now() };
      return {
        ...state,
        dailyClaimedOn: day,
        bustsBalance: state.bustsBalance + DAILY_CLAIM_BONUS,
        bustsHistory: [entry, ...state.bustsHistory.slice(0, 49)],
      };
    }

    case 'CLAIM_CONSOLATION': {
      const { sessionId, amount } = action;
      if (state.claimedConsolations[sessionId]) return state;
      const entry = { amount, reason: 'Drop consolation', ts: Date.now() };
      return {
        ...state,
        bustsBalance: state.bustsBalance + amount,
        claimedConsolations: { ...state.claimedConsolations, [sessionId]: true },
        bustsHistory: [entry, ...state.bustsHistory.slice(0, 49)],
      };
    }

    case 'COMPLETE_NFT': {
      const nft = {
        id:        crypto.randomUUID(),
        elements:  action.elements,
        username:  state.xUser?.username || state.walletUsername || state.username || `Boi#${state.userId.slice(0, 4).toUpperCase()}`,
        createdAt: Date.now(),
        sharedToX: false,
      };
      return { ...state, completedNFTs: [...state.completedNFTs, nft] };
    }

    case 'MARK_SHARED': {
      const entry = { amount: SHARE_NFT_BUSTS, reason: 'Shared portrait on X', ts: Date.now() };
      return {
        ...state,
        completedNFTs: state.completedNFTs.map((n) =>
          n.id === action.nftId ? { ...n, sharedToX: true } : n
        ),
        isWhitelisted: true,
        bustsBalance: state.bustsBalance + SHARE_NFT_BUSTS,
        bustsHistory: [entry, ...state.bustsHistory.slice(0, 49)],
      };
    }

    case 'SEND_GIFT': {
      const gift = {
        id: crypto.randomUUID(),
        fromUserId: state.userId,
        fromXUsername: state.xUser?.username || null,
        toXUsername: action.toXUsername,
        element: action.element,
        ts: Date.now(),
        claimed: false,
      };
      return { ...state, pendingGifts: [...state.pendingGifts, gift] };
    }

    case 'CLAIM_GIFT': {
      const gift = state.pendingGifts.find((g) => g.id === action.giftId);
      if (!gift || gift.claimed) return state;
      return {
        ...state,
        pendingGifts: state.pendingGifts.map((g) =>
          g.id === action.giftId ? { ...g, claimed: true } : g
        ),
      };
    }

    case 'SET_ADMIN':
      return { ...state, isAdmin: action.isAdmin };

    case 'SET_DROP_POOL_SIZE':
      return { ...state, dropPoolSize: Math.max(1, action.poolSize) };

    default:
      return state;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Context
// ═══════════════════════════════════════════════════════════════════════════

const GameContext = createContext(null);
const STORAGE_KEY = 'the1969-v1';

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...makeInitialState(), ...JSON.parse(saved) };
    } catch { /* localStorage unavailable */ }
    return makeInitialState();
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* noop */ }
  }, [state]);

  // ── Derived state ──
  const uniqueTypesOwned = ELEMENT_TYPES.filter((type) =>
    state.inventory.some((i) => i.type === type)
  );
  const progressCount = uniqueTypesOwned.length;
  const hasAllTypes   = progressCount === ELEMENT_TYPES.length;

  const sessInfo   = getSessionStatus(state.dropPoolSize);
  const sessRecord = state.claimedSessions[sessInfo.sessId] || { count: 0, positions: [], firstClaimMs: null };
  const claimsThisSession   = sessRecord.count;
  const canClaimThisSession = claimsThisSession < MAX_CLAIMS_PER_SESSION;

  const reactionTimeSec = sessRecord.firstClaimMs != null
    ? ((sessRecord.firstClaimMs - sessInfo.sessId) / 1000).toFixed(1)
    : null;

  const bestPosition = sessRecord.positions.length > 0
    ? Math.min(...sessRecord.positions)
    : null;

  const sessionStatus = {
    ...sessInfo,
    claimsThisSession,
    canClaimThisSession,
    maxClaims: MAX_CLAIMS_PER_SESSION,
    reactionTimeSec,
    bestPosition,
    claimPositions: sessRecord.positions,
  };

  const hasConsolation = !state.claimedConsolations?.[sessInfo.sessId];
  const canClaimDaily  = state.dailyClaimedOn !== todayKey();

  // ── Actions ──
  const setUsername = useCallback((name) => dispatch({ type: 'SET_USERNAME', username: name }), []);

  const loginWithX = useCallback((user) => {
    dispatch({ type: 'SET_X_USER', user });
    dispatch({ type: 'SET_REFERRAL_CODE', code: user.username });
  }, []);

  const logoutX = useCallback(() => dispatch({ type: 'CLEAR_X_USER' }), []);
  const setReferralCode = useCallback((code) => dispatch({ type: 'SET_REFERRAL_CODE', code }), []);
  const setReferredBy   = useCallback((code) => dispatch({ type: 'SET_REFERRED_BY', code }), []);

  const connectWallet = useCallback(async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        dispatch({ type: 'CONNECT_WALLET', address: accounts[0] });
        return { ok: true, address: accounts[0] };
      } catch (e) {
        return { ok: false, reason: e.message };
      }
    }
    let mockAddr = localStorage.getItem('the1969-mock-wallet');
    if (!mockAddr) {
      const bytes = crypto.getRandomValues(new Uint8Array(20));
      mockAddr = '0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('the1969-mock-wallet', mockAddr);
    }
    dispatch({ type: 'CONNECT_WALLET', address: mockAddr });
    return { ok: true, address: mockAddr, mock: true };
  }, []);

  const disconnectWallet = useCallback(() => dispatch({ type: 'DISCONNECT_WALLET' }), []);

  const claimElement = useCallback((antiBot = {}) => {
    const { timingOk = true, positionOk = true } = antiBot;
    const ss = getSessionStatus(state.dropPoolSize);
    if (!ss.isActive)         return { ok: false, reason: 'No active session' };
    if (ss.isPoolEmpty)       return { ok: false, reason: 'Pool exhausted' };
    if (!canClaimThisSession) return { ok: false, reason: 'Max claims reached for this session' };
    if (!timingOk)            return { ok: false, reason: 'Too fast. Suspected bot.' };
    if (!positionOk)          return { ok: false, reason: 'Suspicious click pattern' };

    const element = pickRandomElement();
    const position = ss.simClaimed + claimsThisSession + 1;
    const bustsReward = DROP_BUSTS_REWARD[element.rarity] || 5;
    dispatch({ type: 'ADD_ELEMENT', element });
    dispatch({ type: 'RECORD_SESSION_CLAIM', sessionId: ss.sessId, position, firstClaim: Date.now() });
    dispatch({ type: 'ADD_BUSTS', amount: bustsReward, reason: `Drop reward: ${element.name}` });
    // Daily claim bonus (first claim of the day)
    if (state.dailyClaimedOn !== todayKey()) {
      dispatch({ type: 'CLAIM_DAILY' });
    }
    return { ok: true, element, position, bustsReward };
  }, [canClaimThisSession, claimsThisSession, state.dropPoolSize, state.dailyClaimedOn]);

  const claimConsolation = useCallback(() => {
    const ss = getSessionStatus(state.dropPoolSize);
    if (state.claimedConsolations?.[ss.sessId]) return { ok: false, reason: 'Already claimed' };
    const amount = Math.floor(Math.random() * 21) + 5;
    dispatch({ type: 'CLAIM_CONSOLATION', sessionId: ss.sessId, amount });
    return { ok: true, amount };
  }, [state.claimedConsolations, state.dropPoolSize]);

  const addBusts     = useCallback((amount, reason) => dispatch({ type: 'ADD_BUSTS', amount, reason }), []);
  const spendBusts   = useCallback((amount, reason) => dispatch({ type: 'SPEND_BUSTS', amount, reason }), []);
  const completeNFT  = useCallback((elements) => dispatch({ type: 'COMPLETE_NFT', elements }), []);
  const markShared   = useCallback((nftId) => dispatch({ type: 'MARK_SHARED', nftId }), []);
  const removeElement = useCallback((elementType, variant) => dispatch({ type: 'REMOVE_ELEMENT', elementType, variant }), []);
  const addGiftedElement = useCallback((element) => dispatch({ type: 'ADD_ELEMENT', element }), []);
  const sendGift = useCallback((toXUsername, element) => {
    dispatch({ type: 'REMOVE_ELEMENT', elementType: element.type, variant: element.variant });
    dispatch({ type: 'SEND_GIFT', toXUsername, element });
  }, []);
  const claimGift = useCallback((giftId) => dispatch({ type: 'CLAIM_GIFT', giftId }), []);

  const resetProgress = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('the1969-mock-wallet');
    window.location.reload();
  }, []);

  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const value = {
    ...state,
    sessionStatus,
    progressCount,
    hasAllTypes,
    uniqueTypesOwned,
    hasConsolation,
    canClaimDaily,
    setUsername,
    loginWithX,
    logoutX,
    connectWallet,
    disconnectWallet,
    setReferralCode,
    setReferredBy,
    claimElement,
    claimConsolation,
    addBusts,
    spendBusts,
    completeNFT,
    markShared,
    removeElement,
    addGiftedElement,
    sendGift,
    claimGift,
    resetProgress,
    setAdmin: (isAdmin) => dispatch({ type: 'SET_ADMIN', isAdmin }),
    setDropPoolSize: (poolSize) => dispatch({ type: 'SET_DROP_POOL_SIZE', poolSize }),
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
