import { createContext, useContext, useEffect, useReducer, useCallback } from 'react';
import { ELEMENT_TYPES, pickRandomElement } from '../data/elements';

// ─── Session constants ──────────────────────────────────────────────────────
const SESSION_INTERVAL_MS    = 60 * 60 * 1000;
const SESSION_WINDOW_MS      = 5 * 60 * 1000;
const MAX_CLAIMS_PER_SESSION = 3;
const SESSION_POOL_SIZE      = 20;

function simulateOtherClaims(sessionStartMs) {
  const elapsedSec = Math.max(0, (Date.now() - sessionStartMs) / 1000);
  const t = Math.min(elapsedSec / (SESSION_WINDOW_MS / 1000), 1);
  return Math.floor(Math.pow(t, 0.45) * 18);
}

function getCurrentSessionId() {
  return Math.floor(Date.now() / SESSION_INTERVAL_MS) * SESSION_INTERVAL_MS;
}

function getSessionStatus() {
  const now     = Date.now();
  const sessId  = getCurrentSessionId();
  const elapsed = now - sessId;
  const isActive       = elapsed < SESSION_WINDOW_MS;
  const msUntilNext    = SESSION_INTERVAL_MS - elapsed;
  const msUntilClose   = isActive ? SESSION_WINDOW_MS - elapsed : 0;
  const simClaimed     = isActive ? simulateOtherClaims(sessId) : SESSION_POOL_SIZE;
  const poolRemaining  = Math.max(0, SESSION_POOL_SIZE - simClaimed);
  const poolPct        = poolRemaining / SESSION_POOL_SIZE;
  const poolEmpty      = poolRemaining <= 0;

  return {
    sessId,
    isActive: isActive && !poolEmpty,
    isPoolEmpty: poolEmpty,
    msUntilNext,
    msUntilClose,
    simClaimed,
    poolRemaining,
    poolPct,
    totalPool: SESSION_POOL_SIZE,
  };
}

// ─── Wallet username derivation ─────────────────────────────────────────────
const ADJECTIVES = ['Funky','Groovy','Wild','Cosmic','Neon','Pixel','Crypto','Diamond','Golden','Shadow','Mystic','Electric','Toxic','Velvet','Savage'];
const NOUNS      = ['Boi','Degen','Ape','Ghost','Wizard','Punk','Raver','Drip','Flex','Sauce','King','Chad','Ninja','Titan','Legend'];

function deriveWalletUsername(addr) {
  const hex  = addr.replace('0x', '').toLowerCase().padEnd(8, '0');
  const adj  = ADJECTIVES[parseInt(hex.slice(0, 2), 16) % ADJECTIVES.length];
  const noun = NOUNS[parseInt(hex.slice(2, 4), 16) % NOUNS.length];
  const num  = parseInt(hex.slice(4, 8), 16) % 10000;
  return `${adj}${noun}${num.toString().padStart(4, '0')}`;
}

// ─── NFT count simulation ────────────────────────────────────────────────────
export function simulateNFTCount() {
  const LAUNCH_MS = 1735689600000; // Jan 1 2026 UTC
  const hours = Math.max(0, (Date.now() - LAUNCH_MS) / 3600000);
  return Math.min(2222, Math.floor(100 + hours * 0.45));
}

// ─── Wheel segments ──────────────────────────────────────────────────────────
export const WHEEL_SEGMENTS = [
  { label: 'NOPE',  amount: 0,   weight: 30, bg: '#9E9E9E', fg: '#fff' },
  { label: '5',     amount: 5,   weight: 25, bg: '#F44336', fg: '#fff' },
  { label: '10',    amount: 10,  weight: 20, bg: '#FF9800', fg: '#fff' },
  { label: '20',    amount: 20,  weight: 12, bg: '#FFC107', fg: '#000' },
  { label: '50',    amount: 50,  weight: 7,  bg: '#4CAF50', fg: '#fff' },
  { label: '100',   amount: 100, weight: 3,  bg: '#2196F3', fg: '#fff' },
  { label: '120',   amount: 120, weight: 2,  bg: '#9C27B0', fg: '#fff' },
  { label: '200',   amount: 200, weight: 1,  bg: '#E91E63', fg: '#fff' },
];

export function pickSpinResult() {
  const total = WHEEL_SEGMENTS.reduce((s, seg) => s + seg.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < WHEEL_SEGMENTS.length; i++) {
    r -= WHEEL_SEGMENTS[i].weight;
    if (r <= 0) return i;
  }
  return 0;
}

// ─── Seed marketplace listings (prices in FUNKY) ─────────────────────────────
function makeSeedListings() {
  return [
    { id: 'mock-1', sellerUserId: 'seed-1', sellerUsername: 'FunkyWizard8823', elementType: 'hair',        variant: 2, elementName: 'Bowl',   rarity: 'rare',       price: 100,  listedAt: Date.now() - 3600000  },
    { id: 'mock-2', sellerUserId: 'seed-2', sellerUsername: 'NeonDegen4451',   elementType: 'glasses',     variant: 3, elementName: 'Shades', rarity: 'legendary',  price: 500,  listedAt: Date.now() - 7200000  },
    { id: 'mock-3', sellerUserId: 'seed-3', sellerUsername: 'PixelBoss0001',   elementType: 'stickers',    variant: 3, elementName: 'Skull',  rarity: 'legendary',  price: 800,  listedAt: Date.now() - 1800000  },
    { id: 'mock-4', sellerUserId: 'seed-4', sellerUsername: 'CryptoDrip7733',  elementType: 'outfit',      variant: 4, elementName: 'Chains', rarity: 'legendary',  price: 350,  listedAt: Date.now() - 5400000  },
    { id: 'mock-5', sellerUserId: 'seed-5', sellerUsername: 'WildSauce2288',   elementType: 'accessories', variant: 2, elementName: 'Phones', rarity: 'rare',       price: 80,   listedAt: Date.now() - 900000   },
    { id: 'mock-6', sellerUserId: 'seed-6', sellerUsername: 'ShadowKing9090',  elementType: 'background',  variant: 3, elementName: 'Storm',  rarity: 'legendary',  price: 600,  listedAt: Date.now() - 10800000 },
    { id: 'mock-7', sellerUserId: 'seed-7', sellerUsername: 'CosmicRaver1122', elementType: 'eyes',        variant: 4, elementName: 'Laser',  rarity: 'ultra_rare', price: 2500, listedAt: Date.now() - 600000   },
    { id: 'mock-8', sellerUserId: 'seed-8', sellerUsername: 'GoldenNinja5577', elementType: 'hair',        variant: 5, elementName: 'Flame',  rarity: 'ultra_rare', price: 2000, listedAt: Date.now() - 2400000  },
  ];
}

// ─── State ───────────────────────────────────────────────────────────────────
function makeInitialState() {
  return {
    userId:               crypto.randomUUID(),
    username:             null,
    xUser:                null, // { id, username, name, avatar } once X-logged in
    walletAddress:        null,
    walletUsername:       null,
    isWalletConnected:    false,
    funkyBalance:         50,  // starter FUNKY
    lastSpinTs:           null,
    funkyHistory:         [],  // [{ amount, reason, ts }]
    claimedConsolations:  {},  // { sessionId: true }
    inventory:            [],
    completedNFTs:        [],
    isWhitelisted:        false,
    claimedSessions:      {},
    marketplace:          makeSeedListings(),
    offers:               [],  // [{ id, listingId, elementName, elementType, variant, sellerUserId, sellerUsername, offerAmount, offererUserId, offererUsername, status, createdAt }]
  };
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
        username:          uname,
      };
    }

    case 'DISCONNECT_WALLET':
      return { ...state, walletAddress: null, walletUsername: null, isWalletConnected: false };

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

    case 'COMPLETE_NFT': {
      const nft = {
        id:        crypto.randomUUID(),
        elements:  action.elements,
        username:  state.walletUsername || state.username || `FunkyBoi#${state.userId.slice(0, 4).toUpperCase()}`,
        createdAt: Date.now(),
        sharedToX: false,
      };
      return { ...state, completedNFTs: [...state.completedNFTs, nft] };
    }

    case 'MARK_SHARED':
      return {
        ...state,
        completedNFTs: state.completedNFTs.map((n) =>
          n.id === action.nftId ? { ...n, sharedToX: true } : n
        ),
        isWhitelisted: true,
      };

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

    case 'ADD_FUNKY': {
      const entry = { amount: action.amount, reason: action.reason || 'Reward', ts: Date.now() };
      return {
        ...state,
        funkyBalance: state.funkyBalance + action.amount,
        funkyHistory: [entry, ...state.funkyHistory.slice(0, 49)],
      };
    }

    case 'SPEND_FUNKY': {
      if (state.funkyBalance < action.amount) return state;
      return { ...state, funkyBalance: Math.max(0, state.funkyBalance - action.amount) };
    }

    case 'RECORD_SPIN': {
      const { amount } = action;
      const entry = { amount, reason: 'Daily Wheel Spin', ts: Date.now() };
      return {
        ...state,
        lastSpinTs:   Date.now(),
        funkyBalance: state.funkyBalance + amount,
        funkyHistory: [entry, ...state.funkyHistory.slice(0, 49)],
      };
    }

    case 'CLAIM_CONSOLATION': {
      const { sessionId, amount } = action;
      if (state.claimedConsolations[sessionId]) return state;
      const entry = { amount, reason: 'Drop Consolation', ts: Date.now() };
      return {
        ...state,
        funkyBalance:         state.funkyBalance + amount,
        claimedConsolations:  { ...state.claimedConsolations, [sessionId]: true },
        funkyHistory:         [entry, ...state.funkyHistory.slice(0, 49)],
      };
    }

    case 'LIST_ELEMENT': {
      const { elementType, variant, price } = action;
      const idx = state.inventory.findIndex(
        (i) => i.type === elementType && i.variant === variant
      );
      if (idx === -1) return state;
      const item = state.inventory[idx];
      const listing = {
        id:             crypto.randomUUID(),
        sellerUserId:   state.userId,
        sellerUsername: state.walletUsername || state.username || 'Anonymous',
        sellerAddress:  state.walletAddress,
        elementType,
        variant,
        elementName: item.name,
        rarity:      item.rarity,
        price,
        listedAt:    Date.now(),
      };
      const newInv = (item.quantity || 1) <= 1
        ? state.inventory.filter((_, i) => i !== idx)
        : state.inventory.map((i, index) =>
            index === idx ? { ...i, quantity: i.quantity - 1 } : i
          );
      return { ...state, inventory: newInv, marketplace: [...state.marketplace, listing] };
    }

    case 'DELIST_ELEMENT': {
      const listing = state.marketplace.find(
        (l) => l.id === action.listingId && l.sellerUserId === state.userId
      );
      if (!listing) return state;
      const existing = state.inventory.find(
        (i) => i.type === listing.elementType && i.variant === listing.variant
      );
      const newInv = existing
        ? state.inventory.map((i) =>
            i === existing ? { ...i, quantity: (i.quantity || 1) + 1 } : i
          )
        : [
            ...state.inventory,
            {
              type: listing.elementType, variant: listing.variant,
              name: listing.elementName, rarity: listing.rarity,
              id: crypto.randomUUID(), quantity: 1, obtainedAt: Date.now(),
            },
          ];
      return {
        ...state,
        inventory:   newInv,
        marketplace: state.marketplace.filter((l) => l.id !== action.listingId),
      };
    }

    case 'MAKE_OFFER': {
      const listing = state.marketplace.find((l) => l.id === action.listingId);
      if (!listing || listing.sellerUserId === state.userId) return state;
      // Remove duplicate pending offer on same listing
      const withoutDupe = state.offers.filter(
        (o) => !(o.listingId === action.listingId && o.offererUserId === state.userId && o.status === 'pending')
      );
      const offer = {
        id:              crypto.randomUUID(),
        listingId:       action.listingId,
        elementName:     listing.elementName,
        elementType:     listing.elementType,
        variant:         listing.variant,
        sellerUserId:    listing.sellerUserId,
        sellerUsername:  listing.sellerUsername,
        listPrice:       listing.price,
        offerAmount:     action.offerAmount,
        offererUserId:   state.userId,
        offererUsername: state.walletUsername || state.username || 'Anonymous',
        status:          'pending',
        createdAt:       Date.now(),
      };
      return { ...state, offers: [offer, ...withoutDupe] };
    }

    case 'CANCEL_OFFER': {
      return {
        ...state,
        offers: state.offers.filter(
          (o) => !(o.id === action.offerId && o.offererUserId === state.userId)
        ),
      };
    }

    case 'ACCEPT_INCOMING_OFFER': {
      const offer = state.offers.find((o) => o.id === action.offerId);
      if (!offer) return state;
      const listing = state.marketplace.find((l) => l.id === offer.listingId);
      if (!listing || listing.sellerUserId !== state.userId) return state;
      const funkyEntry = { amount: offer.offerAmount, reason: `Sold ${offer.elementName}`, ts: Date.now() };
      return {
        ...state,
        funkyBalance: state.funkyBalance + offer.offerAmount,
        funkyHistory: [funkyEntry, ...state.funkyHistory.slice(0, 49)],
        marketplace:  state.marketplace.filter((l) => l.id !== offer.listingId),
        offers:       state.offers.map((o) => o.id === action.offerId ? { ...o, status: 'accepted' } : o),
      };
    }

    case 'DECLINE_OFFER': {
      return {
        ...state,
        offers: state.offers.map((o) => o.id === action.offerId ? { ...o, status: 'declined' } : o),
      };
    }

    case 'BUY_ELEMENT': {
      const listing = state.marketplace.find((l) => l.id === action.listingId);
      if (!listing || listing.sellerUserId === state.userId) return state;
      if (state.funkyBalance < listing.price) return state;
      const existing = state.inventory.find(
        (i) => i.type === listing.elementType && i.variant === listing.variant
      );
      const newInv = existing
        ? state.inventory.map((i) =>
            i === existing ? { ...i, quantity: (i.quantity || 1) + 1 } : i
          )
        : [
            ...state.inventory,
            {
              type: listing.elementType, variant: listing.variant,
              name: listing.elementName, rarity: listing.rarity,
              id: crypto.randomUUID(), quantity: 1, obtainedAt: Date.now(),
            },
          ];
      return {
        ...state,
        inventory:    newInv,
        funkyBalance: Math.max(0, state.funkyBalance - listing.price),
        marketplace:  state.marketplace.filter((l) => l.id !== action.listingId),
      };
    }

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
const GameContext = createContext(null);
const STORAGE_KEY = 'funky-bois-v4';

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...makeInitialState(), ...JSON.parse(saved) };
    } catch (_) {}
    return makeInitialState();
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }, [state]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const uniqueTypesOwned = ELEMENT_TYPES.filter((type) =>
    state.inventory.some((i) => i.type === type)
  );
  const progressCount = uniqueTypesOwned.length;
  const hasAllTypes   = progressCount === ELEMENT_TYPES.length;

  const sessInfo   = getSessionStatus();
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
    maxClaims:      MAX_CLAIMS_PER_SESSION,
    reactionTimeSec,
    bestPosition,
    claimPositions: sessRecord.positions,
  };

  // Wheel spin availability
  const SPIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;
  const canSpin         = !state.lastSpinTs || (Date.now() - state.lastSpinTs) >= SPIN_COOLDOWN_MS;
  const msUntilNextSpin = state.lastSpinTs
    ? Math.max(0, SPIN_COOLDOWN_MS - (Date.now() - state.lastSpinTs))
    : 0;

  // Consolation availability for current session
  const hasConsolation = !state.claimedConsolations?.[sessInfo.sessId];

  // ── Actions ──────────────────────────────────────────────────────────────
  const setUsername = useCallback((name) => {
    dispatch({ type: 'SET_USERNAME', username: name });
  }, []);

  const loginWithX = useCallback((user) => {
    dispatch({ type: 'SET_X_USER', user });
  }, []);

  const logoutX = useCallback(() => {
    dispatch({ type: 'CLEAR_X_USER' });
  }, []);

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
    let mockAddr = localStorage.getItem('funky-mock-wallet');
    if (!mockAddr) {
      const bytes = crypto.getRandomValues(new Uint8Array(20));
      mockAddr = '0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('funky-mock-wallet', mockAddr);
    }
    dispatch({ type: 'CONNECT_WALLET', address: mockAddr });
    return { ok: true, address: mockAddr, mock: true };
  }, []);

  const disconnectWallet = useCallback(() => {
    dispatch({ type: 'DISCONNECT_WALLET' });
  }, []);

  const walletSign = useCallback(async (message) => {
    if (!state.walletAddress) return { ok: false, reason: 'No wallet connected' };
    if (window.ethereum && !localStorage.getItem('funky-mock-wallet')) {
      try {
        const sig = await window.ethereum.request({
          method: 'personal_sign',
          params: [message, state.walletAddress],
        });
        return { ok: true, signature: sig };
      } catch (e) {
        return { ok: false, reason: e.message };
      }
    }
    const mockSig = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, '0')).join('');
    return { ok: true, signature: mockSig, mock: true };
  }, [state.walletAddress]);

  const claimElement = useCallback((antiBot = {}) => {
    const { timingOk = true, positionOk = true } = antiBot;
    const ss = getSessionStatus();
    if (!ss.isActive)         return { ok: false, reason: 'No active session' };
    if (ss.isPoolEmpty)       return { ok: false, reason: 'Pool exhausted' };
    if (!canClaimThisSession) return { ok: false, reason: 'Max claims reached for this session' };
    if (!timingOk)            return { ok: false, reason: 'Too fast — suspected bot' };
    if (!positionOk)          return { ok: false, reason: 'Suspicious click pattern' };

    const element  = pickRandomElement();
    const position = ss.simClaimed + claimsThisSession + 1;
    dispatch({ type: 'ADD_ELEMENT', element });
    dispatch({ type: 'RECORD_SESSION_CLAIM', sessionId: ss.sessId, position, firstClaim: Date.now() });
    return { ok: true, element, position };
  }, [canClaimThisSession, claimsThisSession]);

  const demoClaimElement = useCallback(() => {
    const ss       = getSessionStatus();
    const element  = pickRandomElement();
    const position = Math.floor(Math.random() * 15) + 1;
    dispatch({ type: 'ADD_ELEMENT', element });
    dispatch({ type: 'RECORD_SESSION_CLAIM', sessionId: ss.sessId, position, firstClaim: Date.now() });
    return { ok: true, element, position };
  }, []);

  // Consolation FUNKY when user missed/pool empty
  const claimConsolation = useCallback(() => {
    const ss = getSessionStatus();
    if (state.claimedConsolations?.[ss.sessId]) return { ok: false, reason: 'Already claimed' };
    const amount = Math.floor(Math.random() * 21) + 5; // 5-25 FUNKY
    dispatch({ type: 'CLAIM_CONSOLATION', sessionId: ss.sessId, amount });
    return { ok: true, amount };
  }, [state.claimedConsolations]);

  const spinWheel = useCallback(() => {
    const now = Date.now();
    if (state.lastSpinTs && (now - state.lastSpinTs) < SPIN_COOLDOWN_MS) {
      return { ok: false, msUntilNext: SPIN_COOLDOWN_MS - (now - state.lastSpinTs) };
    }
    const idx     = pickSpinResult();
    const segment = WHEEL_SEGMENTS[idx];
    dispatch({ type: 'RECORD_SPIN', amount: segment.amount, segmentIdx: idx });
    return { ok: true, segment, segmentIdx: idx };
  }, [state.lastSpinTs]);

  const addFunky = useCallback((amount, reason) => {
    dispatch({ type: 'ADD_FUNKY', amount, reason });
  }, []);

  const completeNFT = useCallback((elements) => {
    dispatch({ type: 'COMPLETE_NFT', elements });
  }, []);

  const markShared = useCallback((nftId) => {
    dispatch({ type: 'MARK_SHARED', nftId });
  }, []);

  const removeElement = useCallback((elementType, variant) => {
    dispatch({ type: 'REMOVE_ELEMENT', elementType, variant });
  }, []);

  const addGiftedElement = useCallback((element) => {
    dispatch({ type: 'ADD_ELEMENT', element });
  }, []);

  const makeOffer = useCallback((listingId, offerAmount) => {
    dispatch({ type: 'MAKE_OFFER', listingId, offerAmount });
  }, []);

  const cancelOffer = useCallback((offerId) => {
    dispatch({ type: 'CANCEL_OFFER', offerId });
  }, []);

  const acceptIncomingOffer = useCallback((offerId) => {
    dispatch({ type: 'ACCEPT_INCOMING_OFFER', offerId });
  }, []);

  const declineOffer = useCallback((offerId) => {
    dispatch({ type: 'DECLINE_OFFER', offerId });
  }, []);

  const listElement = useCallback((elementType, variant, price) => {
    dispatch({ type: 'LIST_ELEMENT', elementType, variant, price });
  }, []);

  const delistElement = useCallback((listingId) => {
    dispatch({ type: 'DELIST_ELEMENT', listingId });
  }, []);

  const buyElement = useCallback((listingId) => {
    dispatch({ type: 'BUY_ELEMENT', listingId });
  }, []);

  const resetProgress = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('funky-mock-wallet');
    window.location.reload();
  }, []);

  const value = {
    ...state,
    sessionStatus,
    progressCount,
    hasAllTypes,
    uniqueTypesOwned,
    canSpin,
    msUntilNextSpin,
    hasConsolation,
    setUsername,
    loginWithX,
    logoutX,
    connectWallet,
    disconnectWallet,
    walletSign,
    claimElement,
    demoClaimElement,
    claimConsolation,
    spinWheel,
    addFunky,
    completeNFT,
    markShared,
    removeElement,
    addGiftedElement,
    makeOffer,
    cancelOffer,
    acceptIncomingOffer,
    declineOffer,
    listElement,
    delistElement,
    buyElement,
    resetProgress,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
