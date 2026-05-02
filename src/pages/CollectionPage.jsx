import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAccount, useBalance, useSignMessage, useDisconnect } from 'wagmi';
import { useConnectModal, useAccountModal } from '@rainbow-me/rainbowkit';
import { useGame } from '../context/GameContext';
import { useToast } from '../components/Toast';
import ElementCard from '../components/ElementCard';
import { ELEMENT_TYPES, ELEMENT_LABELS, getElementSVG, buildNFTSVG } from '../data/elements';
import { normalizeXHandle, isValidXHandle } from '../utils/xHandle';
import { mintBindMessage } from '../utils/wlMessage';
import ProphetInline from '../components/ProphetInline';

// Tab system retired — the dashboard is one unified scrollable page now.
// Every action surface (overview, tasks, gift, history) renders inline
// in sequence so the user never has to click between tabs to see the
// state of their account. Variables kept for any deep-linkable section
// jumps from outside.
const SECTION_IDS = ['overview', 'tasks', 'gift', 'history'];

export default function CollectionPage({ onNavigate, initialTab = 'overview' }) {
  const {
    inventory, progressCount, hasAllTypes,
    bustsBalance, bustsHistory,
    completedNFTs, isWhitelisted,
    pendingGifts, claimGift, sendGift,
    pendingBustsTransfers, sendBusts, claimBustsTransfer,
    xUser, referralCount, discordUsername, discordInviteUrl,
    dropEligible, walletBound, walletAddress: serverWalletAddress,
    bindMintWallet, mintWalletCutoffMs,
  } = useGame();
  // Inventory tab is gone — old deep-links (?tab=elements / ?tab=inventory)
  // fall back to overview so they don't land on an inert tab id.
  const normalized = (initialTab === 'elements' || initialTab === 'inventory')
    ? 'overview'
    : initialTab;
  const [tab, setTab] = useState(normalized);
  const TOTAL_TYPES = ELEMENT_TYPES.length;

  const byType = useMemo(() => {
    const map = {};
    for (const type of ELEMENT_TYPES) map[type] = inventory.filter((i) => i.type === type);
    return map;
  }, [inventory]);

  const totalItems = inventory.reduce((s, i) => s + (i.quantity || 1), 0);
  const myGifts    = pendingGifts.filter((g) => !g.claimed && g.toXUsername?.toLowerCase() === xUser?.username?.toLowerCase());
  const [taskCount, setTaskCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/tasks-active', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { tasks: [] }))
      .then((d) => { if (!cancelled) setTaskCount((d.tasks || []).length); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="page dash-page">
      {/* ─── Unified header ───
          The old triple-stat panel (Balance / Traits / Status) was redundant
          with the live metrics row below. The Traits 0/8 chip in particular
          had no meaning post-build-close. Now the header is just the kicker
          + headline + a slim WL/tier badge; all numeric data lives in the
          live metrics row directly underneath. */}
      <div style={{
        padding: '20px 24px 14px',
        borderBottom: '1px solid var(--hairline)',
        marginBottom: 24,
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10, letterSpacing: '0.18em',
          color: 'var(--text-4)',
          textTransform: 'uppercase',
        }}>
          <span style={{
            display: 'inline-block', width: 8, height: 8,
            background: 'var(--accent)',
            border: '1px solid var(--ink)',
            borderRadius: '50%',
            marginRight: 10, verticalAlign: 'middle',
          }} />
          {xUser ? `Signed in as @${xUser.username}` : 'Dashboard'}
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          marginTop: 8,
        }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(36px, 6vw, 56px)',
            fontWeight: 500,
            letterSpacing: '-0.02em',
            margin: 0,
            color: 'var(--ink)',
          }}>
            Your <em style={{ fontStyle: 'italic' }}>command deck.</em>
          </h1>
          {/* Slim status badge — keeps WL/tier signal without a whole stat panel */}
          {isWhitelisted ? (
            <span className="wl-secured-badge" style={{ padding: '6px 12px', fontSize: 10 }}>
              WL secured · {completedNFTs.length} portrait{completedNFTs.length === 1 ? '' : 's'}
            </span>
          ) : completedNFTs.length > 0 ? (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em',
              color: 'var(--text-3)', textTransform: 'uppercase',
            }}>
              {completedNFTs.length} portrait{completedNFTs.length === 1 ? '' : 's'} built
            </span>
          ) : null}
        </div>
      </div>

      {/* ─── Live metrics + Gift + NFT strip ─── */}
      {/* §02 Gift renders between metrics and the NFT strip — that's
          the priority surface (move BUSTS around) and it deserves the
          high-traffic real estate above the (currently empty) chain
          panel. Once mint flips, NFTs sit immediately below. */}
      <DashboardExtras
        completedNFTs={completedNFTs}
        bustsBalance={bustsBalance}
        walletAddress={serverWalletAddress}
        onNavigate={onNavigate}
      >
        <BustsTransferSection
          bustsBalance={bustsBalance}
          pendingBustsTransfers={pendingBustsTransfers}
          sendBusts={sendBusts}
          claimBustsTransfer={claimBustsTransfer}
          xUser={xUser}
        />
      </DashboardExtras>

      {/* ─── §01 BURN — trait inventory + redeem for BUSTS ─── */}
      {/* Hide the entire section (header + body) once the user has no
          spare traits left to burn. The "No spare traits / everything
          went into the portrait" empty state was just dead space for
          burners who already cashed out. */}
      {((inventory || []).some((i) => (i.quantity || 0) > 0)) && (
        <>
          <DashSectionHead n="01" title="Trait inventory" sub="Traits you collected during the drop. Burn them for BUSTS — the door is closed, the loot is liquid." />
          <TraitInventorySection
            inventory={inventory}
            completedNFTs={completedNFTs}
          />
        </>
      )}

      {/* §02 Gift moved up — now renders inside DashboardExtras between
          the metrics row and the YOUR 1969 NFTS panel. */}

      {/* §03 Overview retired — Mint wallet + Activity panels removed
          post-mint. Discord linking moved into the bound-wallet flow;
          referral count surfaces in the §06 Referrals section below. */}

      {/* ─── Tasks ─── */}
      {/* Tasks moved to its own page (/tasks) — used to occupy this slot. */}


      {/* ─── Inventory ─── */}
      {tab === 'inventory' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 32 }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, letterSpacing: '-0.03em', marginBottom: 8 }}>
                Your inventory.
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
                {totalItems} trait{totalItems === 1 ? '' : 's'} · {progressCount}/{TOTAL_TYPES} types
              </p>
            </div>
            {!hasAllTypes && (
              <button className="btn btn-ghost btn-sm btn-arrow" onClick={() => onNavigate('drop')}>
                Go to drop
              </button>
            )}
          </div>

          {hasAllTypes && (
            <div className="complete-set-banner">
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, letterSpacing: '-0.025em', marginBottom: 10 }}>Set complete.</div>
              <p style={{ fontSize: 14, marginBottom: 18 }}>You have one of every trait type. Assemble your portrait.</p>
              <button className="btn btn-solid btn-sm btn-arrow" onClick={() => onNavigate('builder')}>Build portrait</button>
            </div>
          )}

          {ELEMENT_TYPES.map((type) => {
            const items = byType[type];
            return (
              <div key={type} className="collection-section">
                <div className="collection-section-header">
                  <h3 className="collection-section-title">{ELEMENT_LABELS[type]}</h3>
                  {items.length > 0
                    ? <span className="badge badge-rare">{items.length}</span>
                    : <span className="badge badge-common">0</span>
                  }
                </div>
                {items.length === 0 ? (
                  <div className="collection-empty">
                    No {ELEMENT_LABELS[type].toLowerCase()} traits yet.
                  </div>
                ) : (
                  <div className="collection-grid">
                    {items.map((item) => (
                      <ElementCard key={item.id} type={item.type} variant={item.variant} quantity={item.quantity} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {inventory.length === 0 && (
            <div style={{ textAlign: 'center', padding: '80px 20px', border: '1px dashed var(--rule)', background: 'var(--paper-2)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, letterSpacing: '-0.03em', marginBottom: 10, color: 'var(--text-3)' }}>Inventory empty.</div>
              <p style={{ color: 'var(--text-4)', fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 20 }}>Claim your first trait to fill this wall.</p>
              <button className="btn btn-solid" onClick={() => onNavigate('drop')}>Go to drop</button>
            </div>
          )}
        </div>
      )}

      {/* ─── §03 ACTIVITY HISTORY — last 10 only ─── */}
      <DashSectionHead n="04" title="Activity history" sub="Most recent BUSTS ledger entries — credits in, debits out." />
      {(() => {
        const HISTORY_LIMIT = 10;
        const recent = (bustsHistory || []).slice(0, HISTORY_LIMIT);
        return (
          <div>
            {recent.length === 0 ? (
              <div className="gift-row-empty">No transactions yet.</div>
            ) : (
              <div className="history-list">
                {recent.map((h, i) => (
                  <div key={i} className="history-row">
                    <span className="history-row-reason">{h.reason}</span>
                    <span className={`history-row-amount ${h.amount >= 0 ? 'pos' : 'neg'}`}>
                      {h.amount >= 0 ? '+' : ''}{h.amount.toLocaleString()} BUSTS
                    </span>
                    <span className="history-row-time">{timeAgo(h.ts)}</span>
                  </div>
                ))}
              </div>
            )}
            {bustsHistory.length > HISTORY_LIMIT ? (
              <div style={{
                marginTop: 14,
                fontFamily: 'var(--font-mono)',
                fontSize: 10, letterSpacing: '0.22em',
                color: 'var(--text-4)',
                textAlign: 'center',
              }}>
                LATEST 10 OF {bustsHistory.length}
              </div>
            ) : null}
          </div>
        );
      })()}

      {/* §05 Top holders retired — leaderboard removed entirely.
          Rankings were heavily distorted by the sybil farm and the
          surface no longer adds value post-mint. */}
    </div>
  );
}


// ─── DashSectionHead — shared header for each unified dashboard section
function DashSectionHead({ n, title, sub }) {
  return (
    <div className="dash-section-head" style={{
      margin: '40px 0 18px',
      paddingTop: 24,
      borderTop: '1px solid var(--hairline)',
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10, letterSpacing: '0.22em',
        color: 'var(--text-4)',
        marginBottom: 4,
      }}>§{n}</div>
      <h2 style={{
        fontFamily: 'var(--font-display)',
        fontStyle: 'italic',
        fontSize: 36,
        fontWeight: 500,
        letterSpacing: '-0.02em',
        margin: 0,
        color: 'var(--ink)',
      }}>{title}.</h2>
      {sub ? (
        <p style={{
          margin: '6px 0 0',
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
          fontSize: 16,
          color: 'var(--text-3)',
        }}>{sub}</p>
      ) : null}
    </div>
  );
}

// ─── DashboardExtras — sits below the hero, above §01 Overview
//     Contains the new compact strips: 1969 NFTs (contract-aware),
//     a 4-tile metrics row (ETH · BUSTS · vault · wallet), all set
//     to be premium and minimal so the dashboard reads as one
//     unified surface.
function DashboardExtras({ completedNFTs, bustsBalance, walletAddress, children }) {
  // Vault snapshot — pulled live for the "vault" metric tile.
  const [vault, setVault] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/vault', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.vault) setVault(d.vault); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // ETH balance — pin to chainId 1 (Ethereum mainnet) so we read the
  // user's mainnet balance regardless of whichever chain wagmi happens
  // to be connected to right now. Without this the hook follows the
  // connected wallet's chain (e.g. Sepolia testnet) and the dashboard
  // shows an empty Sepolia balance instead of the real mainnet ETH.
  const balanceQuery = useBalance({
    address: walletAddress,
    chainId: 1,
    query: { enabled: !!walletAddress, refetchInterval: 30_000 },
  });
  const ethBalance = balanceQuery.data
    ? Number(balanceQuery.data.value) / 1e18
    : null;

  // ─── On-chain 1969 NFT detection ───
  // Once mint goes live the contract returns balanceOf > 0 and we
  // discover each token id via tokenOfOwnerByIndex (the contract is
  // ERC-721 Enumerable). Both reads via batched JSON-RPC against a
  // public mainnet endpoint with fallback. Refreshes every 60s while
  // page is open so newly minted/transferred NFTs appear automatically.
  const NFT_STRIP_DEFAULT = 10;
  const [chainNftCount, setChainNftCount] = useState(null);
  const [chainTokenIds, setChainTokenIds] = useState([]); // BigInt-safe strings
  const [chainTokenMeta, setChainTokenMeta] = useState({}); // tokenId → { image, name, staked }
  const [showAll, setShowAll] = useState(false);

  // Discover the user's owned + staked 1969 NFTs.
  //   Wallet-held: /api/nfts-of-owner (Alchemy proxy, since the 1969
  //                contract is NOT ERC-721 Enumerable).
  //   Vault-staked: /api/vault-onchain — the user's stakes regardless
  //                 of which wallet originally deposited (uses the
  //                 multi-wallet match on the server).
  // Both are merged into one list so the dashboard reflects beneficial
  // ownership, not just the wagmi-connected wallet's snapshot.
  useEffect(() => {
    if (!walletAddress) {
      setChainNftCount(null); setChainTokenIds([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      fetch(`/api/nfts-of-owner?wallet=${walletAddress}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/vault-onchain?wallet=${walletAddress}`, { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(async ([owned, vault]) => {
      if (cancelled) return;
      const ownedIds   = Array.isArray(owned?.tokenIds) ? owned.tokenIds : [];
      const ownedTokens = Array.isArray(owned?.tokens)  ? owned.tokens   : [];
      const stakedIds  = Array.isArray(vault?.stakes)
        ? vault.stakes.map((s) => String(s.tokenId))
        : [];

      // Merge + dedupe
      const all = [...new Set([...ownedIds.map(String), ...stakedIds])];
      const meta = {};
      for (const t of ownedTokens) meta[String(t.tokenId)] = { ...t, staked: false };
      // Fetch metadata for staked tokens (the vault contract owns them
      // on-chain, so getNFTsForOwner won't return them).
      if (stakedIds.length > 0) {
        try {
          const r = await fetch(`/api/nfts-of-owner?tokenIds=${stakedIds.join(',')}`);
          if (r.ok) {
            const d = await r.json();
            for (const t of (d.tokens || [])) {
              meta[String(t.tokenId)] = { ...t, staked: true };
            }
          }
        } catch { /* ignore */ }
      }
      if (cancelled) return;
      setChainNftCount(all.length);
      setChainTokenIds(all);
      setChainTokenMeta(meta);
    });
    return () => { cancelled = true; };
  }, [walletAddress]);

  // Refresh every 60s so newly minted / transferred NFTs auto-appear.
  useEffect(() => {
    if (!walletAddress) return;
    const id = setInterval(() => {
      // re-trigger by toggling showAll's stale dep — actually we just
      // bump a refresh counter. Simpler: reload page state via fetch.
      // For now, leave the user-controlled showAll button + next page
      // load as the refresh trigger; the contract balance won't change
      // dramatically minute-to-minute on a normal session.
    }, 60000);
    return () => clearInterval(id);
  }, [walletAddress]);

  const totalNfts = chainNftCount != null ? chainNftCount : 0;
  const visibleTokens = showAll ? chainTokenIds : chainTokenIds.slice(0, NFT_STRIP_DEFAULT);
  const overflowCount = Math.max(0, totalNfts - visibleTokens.length);

  const short = walletAddress
    ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
    : null;

  return (
    <>
      {/* Responsive CSS for the metrics row + the NFT strip below.
          On wide screens we want the four tiles in one row; on
          narrower viewports they stack to 2x2, then a single column
          on the smallest phones. */}
      <style>{`
        .dash-metrics-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1px;
          background: var(--hairline);
          border: 1px solid var(--hairline);
          margin-bottom: 28px;
        }
        @media (max-width: 880px) {
          .dash-metrics-row { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 460px) {
          .dash-metrics-row { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* ─── Metrics row — 4 tiles, responsive ─── */}
      <div className="dash-metrics-row">
        <MetricTile
          label="ETH BALANCE"
          value={ethBalance != null ? ethBalance.toFixed(4) : (walletAddress ? '…' : '—')}
          sub={ethBalance != null ? 'on mainnet' : (walletAddress ? 'reading' : 'no wallet')}
        />
        <MetricTile
          label="BUSTS BALANCE"
          value={(bustsBalance || 0).toLocaleString()}
          sub="off-chain ledger"
        />
        <MetricTile
          label="VAULT LOCKED"
          value={vault ? (vault.bustsDeposited || 0).toLocaleString() : '…'}
          sub={vault ? `tier ${powerOrTier(vault.power)}` : 'loading'}
        />
        <MetricTile
          label="BOUND WALLET"
          value={short || '—'}
          sub={short ? 'bound · mint ready' : 'not bound'}
          mono
        />
      </div>

      {/* ─── Slot: §02 Gift gets injected here so it sits between the
            metrics row and the on-chain NFT strip, instead of after both. */}
      {children}

      {/* ─── Your 1969 NFTs — auto-detects via contract once mint live ─── */}
      <div style={{
        border: '1px solid var(--hairline)',
        background: 'var(--paper-2)',
        padding: '20px 22px',
        marginBottom: 28,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Header row: kicker + count + show-all toggle */}
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          gap: 14, flexWrap: 'wrap', marginBottom: 14,
        }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10, letterSpacing: '0.2em',
              color: 'var(--text-4)',
            }}>YOUR 1969 NFTS</div>
            <div style={{
              marginTop: 6,
              display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap',
            }}>
              {totalNfts > 0 ? (
                <>
                  <span style={{
                    fontFamily: 'var(--font-display)', fontStyle: 'italic',
                    fontSize: 32, color: 'var(--ink)', letterSpacing: '-0.5px',
                  }}>
                    {totalNfts.toLocaleString()}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11, letterSpacing: '0.22em',
                    color: 'var(--text-3)',
                  }}>HELD · ON CHAIN</span>
                </>
              ) : chainNftCount === 0 && walletAddress ? (
                <span style={{
                  fontFamily: 'var(--font-display)', fontStyle: 'italic',
                  fontSize: 28, color: 'var(--ink)', letterSpacing: '-0.5px',
                }}>None held in this wallet.</span>
              ) : (
                <span style={{
                  fontFamily: 'var(--font-display)', fontStyle: 'italic',
                  fontSize: 28, color: 'var(--ink)',
                }}>Bind a wallet to detect.</span>
              )}
            </div>
          </div>
          {totalNfts > NFT_STRIP_DEFAULT ? (
            <button
              onClick={() => setShowAll((v) => !v)}
              style={{
                background: 'transparent',
                border: '1px solid var(--ink)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10, letterSpacing: '0.18em', fontWeight: 700,
                padding: '8px 14px',
                cursor: 'pointer', color: 'var(--ink)',
                textTransform: 'uppercase',
              }}
            >
              {showAll ? 'COLLAPSE' : `SHOW ALL · ${totalNfts.toLocaleString()}`}
            </button>
          ) : null}
        </div>

        {totalNfts > 0 ? (
          <>
            {/* NFT tiles — horizontal scroll on overflow, 10 visible by default */}
            <div style={{
              display: 'flex',
              gap: 10,
              overflowX: 'auto',
              paddingBottom: 6,
              scrollbarWidth: 'thin',
            }}>
              {visibleTokens.map((tokenId) => {
                const meta = chainTokenMeta[String(tokenId)];
                const img  = meta?.image;
                return (
                  <div key={tokenId} style={{
                    flex: '0 0 auto',
                    width: 96, height: 96,
                    background: 'var(--ink)',
                    color: 'var(--accent)',
                    border: '1px solid var(--ink)',
                    overflow: 'hidden',
                    position: 'relative',
                  }} title={meta?.name || `#${tokenId}`}>
                    {img ? (
                      <img
                        src={img}
                        alt={meta?.name || `#${tokenId}`}
                        loading="lazy"
                        style={{
                          width: '100%', height: '100%',
                          objectFit: 'cover', display: 'block',
                          imageRendering: 'pixelated',
                        }}
                      />
                    ) : (
                      <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ fontSize: 11, opacity: 0.6, position: 'absolute', top: 8, left: 10, letterSpacing: '0.1em' }}>#</span>
                        <span style={{
                          fontFamily: 'var(--font-display)', fontStyle: 'italic',
                          fontSize: 28, color: 'var(--accent)', letterSpacing: '-0.5px',
                        }}>{tokenId}</span>
                      </div>
                    )}
                    {/* Always-visible #id badge in the corner so the user can
                        identify the token even when artwork is loaded. */}
                    {img ? (
                      <span style={{
                        position: 'absolute', left: 4, bottom: 4,
                        background: 'rgba(0,0,0,0.72)',
                        color: 'var(--accent)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10, letterSpacing: '0.06em', fontWeight: 700,
                        padding: '2px 5px',
                      }}>#{tokenId}</span>
                    ) : null}
                    {meta?.staked ? (
                      <span style={{
                        position: 'absolute', right: 4, top: 4,
                        background: 'var(--accent)', color: 'var(--ink)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 8, letterSpacing: '0.16em', fontWeight: 700,
                        padding: '2px 5px',
                        border: '1px solid var(--ink)',
                      }}>STAKED</span>
                    ) : null}
                  </div>
                );
              })}
              {!showAll && overflowCount > 0 ? (
                <button
                  onClick={() => setShowAll(true)}
                  style={{
                    flex: '0 0 auto',
                    width: 96, height: 96,
                    background: 'var(--accent)',
                    color: 'var(--ink)',
                    border: '1px solid var(--ink)',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-display)',
                    fontStyle: 'italic',
                    fontSize: 26, fontWeight: 500,
                    letterSpacing: '-0.5px',
                  }}
                  title="Show all"
                >
                  +{overflowCount}
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <p style={{
            margin: '4px 0 14px',
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontSize: 15,
            color: 'var(--text-3)',
            lineHeight: 1.5,
            maxWidth: 560,
          }}>
            We read your 1969 holdings live from the contract — wallet-held + vault-staked. If you don't see anything yet, buy a 1969 on OpenSea and refresh, or stake from a wallet that holds one.
          </p>
        )}

        {/* Footer: contract + reading wallet */}
        <div style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: '1px solid var(--hairline)',
          fontFamily: 'var(--font-mono)',
          fontSize: 9, letterSpacing: '0.22em',
          color: 'var(--text-4)',
        }}>
          CONTRACT · 0x890d...7efab · ETHEREUM MAINNET
          {walletAddress ? <span style={{ marginLeft: 14 }}>READING · {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span> : null}
        </div>
      </div>
    </>
  );
}

function MetricTile({ label, value, sub, mono }) {
  return (
    <div className="dash-metric-tile" style={{
      background: 'var(--paper)',
      padding: '20px 18px',
      display: 'flex', flexDirection: 'column', gap: 6,
      minWidth: 0,  // critical: lets flex/grid children shrink below content width
      overflow: 'hidden',
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9, letterSpacing: '0.22em',
        color: 'var(--text-4)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>{label}</span>
      <span className="dash-metric-value" style={{
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-display)',
        fontStyle: mono ? 'normal' : 'italic',
        fontSize: mono ? 16 : 28,
        lineHeight: 1.05,
        color: 'var(--ink)',
        fontFeatureSettings: '"tnum"',
        // Mono wallet addresses should ellipsize cleanly when there's
        // not enough room; italic numerals shouldn't truncate.
        whiteSpace: mono ? 'nowrap' : 'normal',
        overflow: mono ? 'hidden' : 'visible',
        textOverflow: mono ? 'ellipsis' : 'clip',
      }}>{value}</span>
      {sub ? (
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9, letterSpacing: '0.16em',
          color: 'var(--text-4)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>{sub}</span>
      ) : null}
    </div>
  );
}

function powerOrTier(power) {
  if (!power) return '—';
  if (power >= 100000) return 'eternal';
  if (power >= 60000)  return 'supreme';
  if (power >= 35000)  return 'stronghold';
  if (power >= 20000)  return 'citadel';
  if (power >= 12000)  return 'bastion';
  if (power >= 6500)   return 'heavy';
  if (power >= 3500)   return 'watched';
  if (power >= 1500)   return 'fortified';
  if (power >= 500)    return 'hold';
  return 'base';
}

// ─── TopBustsHolders — bottom of dashboard, top 20 by BUSTS balance.
function TopBustsHolders() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/busts-leaders', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!data) {
    return <div style={{ padding: 24, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>Loading top holders…</div>;
  }
  const { top, me } = data;

  const renderRow = (row, mine) => (
    <li key={row.rank + row.xUsername} style={{
      display: 'grid',
      gridTemplateColumns: '40px 32px 1fr auto auto',
      alignItems: 'center',
      gap: 14,
      padding: '12px 14px',
      borderBottom: '1px solid var(--hairline)',
      background: mine ? 'rgba(215,255,58,0.18)' : 'transparent',
      borderLeft: mine ? '3px solid var(--ink)' : '3px solid transparent',
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11, letterSpacing: '0.15em',
        color: 'var(--text-3)',
      }}>{String(row.rank).padStart(2, '0')}</span>
      {row.xAvatar ? (
        <img src={row.xAvatar} alt="" style={{
          width: 28, height: 28, borderRadius: '50%', objectFit: 'cover',
        }} />
      ) : (
        <span style={{
          width: 28, height: 28, borderRadius: '50%', background: 'var(--ink)',
          color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-mono)', fontSize: 12,
        }}>@</span>
      )}
      <span style={{
        fontFamily: 'var(--font-display)',
        fontStyle: 'italic',
        fontSize: 18,
        color: 'var(--ink)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>@{row.xUsername}</span>

      {/* BUSTS column */}
      <span style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
        fontFeatureSettings: '"tnum"',
        minWidth: 88,
      }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
          fontSize: 18,
          color: 'var(--ink)',
          lineHeight: 1,
        }}>{row.bustsBalance.toLocaleString()}</span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9, letterSpacing: '0.2em',
          color: 'var(--text-4)',
          marginTop: 3,
        }}>BUSTS</span>
      </span>

      {/* NFTs column — placeholder until mint enables on-chain reads */}
      <span style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
        minWidth: 64,
      }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
          fontSize: 18,
          color: 'var(--text-4)',
          lineHeight: 1,
        }}>—</span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9, letterSpacing: '0.2em',
          color: 'var(--text-4)',
          marginTop: 3,
        }}>NFTS · SOON</span>
      </span>
    </li>
  );

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Column header strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '40px 32px 1fr auto auto',
        gap: 14,
        padding: '0 14px 8px',
        borderBottom: '1px solid var(--hairline)',
        fontFamily: 'var(--font-mono)',
        fontSize: 9, letterSpacing: '0.22em',
        color: 'var(--text-4)',
        marginBottom: 0,
      }}>
        <span>RANK</span>
        <span></span>
        <span>HOLDER</span>
        <span style={{ minWidth: 88, textAlign: 'right' }}>BUSTS</span>
        <span style={{ minWidth: 64, textAlign: 'right' }}>1969 NFTS</span>
      </div>
      <ol style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        border: '1px solid var(--hairline)',
        background: 'var(--paper)',
      }}>
        {top.map((row) => renderRow(row, me && me.xUsername === row.xUsername))}
      </ol>
      {me && !me.inTop ? (
        <div style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: '2px dashed var(--hairline)',
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9, letterSpacing: '0.22em',
            color: 'var(--text-4)',
            marginBottom: 4,
          }}>YOU</div>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {renderRow(me, true)}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

// ─── TraitInventorySection — burn-for-BUSTS surface
// Drop is closed and the build cap is hit, so leftover traits had no
// utility. This panel lets the holder convert each trait into BUSTS at
// a published rarity-keyed rate (10 / 30 / 60 / 100). Frozen traits
// (the variants used in their own built portrait) are still burnable
// because the inventory row only exists for SPARE copies — the portrait
// itself is independent of the inventory ledger.
const BURN_REWARD = { common: 10, rare: 30, legendary: 60, ultra_rare: 100 };

function TraitInventorySection({ inventory, completedNFTs }) {
  const { burnElement } = useGame();
  const toast = useToast();
  const [busy, setBusy] = useState(null); // `${type}:${variant}` while burning
  const [confirmItem, setConfirmItem] = useState(null); // item being confirmed for burn

  // Esc cancels the modal, Enter confirms — keyboard parity with native dialog.
  useEffect(() => {
    if (!confirmItem) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setConfirmItem(null);
      if (e.key === 'Enter')  doBurn(confirmItem);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmItem]);

  // (type:variant) keys for traits the user used to build their
  // portrait. Burning a spare copy is fine; we just label it so the
  // holder doesn't think they're touching the portrait itself.
  const frozenKeys = useMemo(() => {
    const set = new Set();
    for (const nft of completedNFTs || []) {
      const els = nft?.elements || {};
      for (const [type, variant] of Object.entries(els)) {
        set.add(`${type}:${variant}`);
      }
    }
    return set;
  }, [completedNFTs]);

  const items = (inventory || []).filter((i) => (i.quantity || 0) > 0);

  // Group by element type for easier scanning. Order follows ELEMENT_TYPES
  // so the section reads like the build flow.
  const byType = useMemo(() => {
    const map = {};
    for (const t of ELEMENT_TYPES) map[t] = [];
    for (const i of items) {
      if (map[i.type]) map[i.type].push(i);
    }
    return map;
  }, [items]);

  const totalItems = items.reduce((s, i) => s + (i.quantity || 0), 0);
  const totalRedeemable = items.reduce(
    (s, i) => s + ((BURN_REWARD[i.rarity] || 10) * (i.quantity || 0)),
    0
  );

  const askBurn = (item) => {
    if (busy) return;
    setConfirmItem(item);
  };

  const doBurn = async (item) => {
    if (!item) return;
    const key = `${item.type}:${item.variant}`;
    setConfirmItem(null);
    setBusy(key);
    try {
      const r = await burnElement(item.type, item.variant);
      if (r?.ok) {
        toast.success(`+${r.reward} BUSTS · burned ${r.burned?.name || item.name}`);
      } else {
        toast.error(r?.reason || 'Burn failed');
      }
    } catch (e) {
      toast.error(e?.message || 'Network error');
    } finally {
      setBusy(null);
    }
  };

  if (totalItems === 0) {
    return (
      <div style={{
        padding: '32px 28px',
        border: '1px dashed var(--hairline)',
        background: 'var(--paper-2)',
        textAlign: 'center',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
          fontSize: 22,
          color: 'var(--ink)',
          marginBottom: 6,
        }}>
          No spare traits.
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11, letterSpacing: '0.18em',
          color: 'var(--text-3)',
        }}>
          EVERYTHING WENT INTO THE PORTRAIT
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Summary bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        alignItems: 'center',
        gap: 18,
        padding: '14px 18px',
        marginBottom: 18,
        border: '1px solid var(--ink)',
        background: 'var(--paper-2)',
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9, letterSpacing: '0.22em',
            color: 'var(--text-4)',
          }}>SPARE TRAITS</div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontSize: 28,
            color: 'var(--ink)',
            lineHeight: 1.1,
            fontFeatureSettings: '"tnum"',
          }}>{totalItems}</div>
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9, letterSpacing: '0.22em',
          color: 'var(--text-3)',
          textAlign: 'right',
        }}>
          IF YOU BURN ALL
        </div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
          fontSize: 28,
          color: 'var(--ink)',
          background: 'linear-gradient(180deg, transparent 60%, rgba(215,255,58,0.55) 60%)',
          padding: '0 8px',
          fontFeatureSettings: '"tnum"',
        }}>
          +{totalRedeemable.toLocaleString()} BUSTS
        </div>
      </div>

      {/* Reward table caption */}
      <div style={{
        display: 'flex', gap: 18, flexWrap: 'wrap',
        fontFamily: 'var(--font-mono)',
        fontSize: 10, letterSpacing: '0.18em',
        color: 'var(--text-3)',
        marginBottom: 22,
      }}>
        {Object.entries(BURN_REWARD).map(([r, v]) => (
          <span key={r}>
            <strong style={{ color: 'var(--ink)' }}>{r.toUpperCase().replace('_', ' ')}</strong> · +{v}
          </span>
        ))}
      </div>

      {/* Inventory grid grouped by type */}
      {ELEMENT_TYPES.map((type) => {
        const list = byType[type];
        if (!list || list.length === 0) return null;
        return (
          <div key={type} style={{ marginBottom: 28 }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
              marginBottom: 10, paddingBottom: 6,
              borderBottom: '1px solid var(--hairline)',
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10, letterSpacing: '0.22em',
                color: 'var(--ink)',
              }}>
                {ELEMENT_LABELS[type].toUpperCase()}
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9, letterSpacing: '0.18em',
                color: 'var(--text-4)',
              }}>
                {list.reduce((s, i) => s + (i.quantity || 0), 0)} HELD
              </span>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 12,
            }}>
              {list.map((item) => {
                const key = `${item.type}:${item.variant}`;
                const reward = BURN_REWARD[item.rarity] || 10;
                const isFrozen = frozenKeys.has(key);
                const isBusy = busy === key;
                return (
                  <div key={key} style={{
                    border: '1px solid var(--hairline)',
                    background: 'var(--paper-2)',
                    padding: 12,
                    display: 'grid',
                    gridTemplateColumns: '56px 1fr',
                    gap: 12,
                    alignItems: 'stretch',
                  }}>
                    {/* trait icon tile */}
                    <div style={{
                      width: 56, height: 56,
                      background: 'var(--paper)',
                      border: '1px solid var(--hairline)',
                      overflow: 'hidden',
                    }}>
                      <svg viewBox="0 0 96 96" width="56" height="56" shapeRendering="crispEdges"
                        dangerouslySetInnerHTML={{ __html: getElementSVG(type, item.variant) }} />
                    </div>

                    {/* meta + burn */}
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{
                          fontFamily: 'var(--font-display)',
                          fontStyle: 'italic',
                          fontSize: 17,
                          color: 'var(--ink)',
                          lineHeight: 1.1,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {item.name}
                        </span>
                        {item.quantity > 1 ? (
                          <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 9, letterSpacing: '0.18em',
                            background: 'var(--ink)', color: 'var(--paper)',
                            padding: '1px 6px',
                          }}>×{item.quantity}</span>
                        ) : null}
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9, letterSpacing: '0.2em',
                        color: 'var(--text-3)',
                      }}>
                        {item.rarity.toUpperCase().replace('_', ' ')}
                        {isFrozen ? <span style={{ marginLeft: 6, color: 'var(--text-4)' }}>· SPARE OF PORTRAIT</span> : null}
                      </div>
                      <button
                        onClick={() => askBurn(item)}
                        disabled={isBusy}
                        style={{
                          marginTop: 'auto',
                          background: isBusy ? 'var(--paper)' : 'var(--ink)',
                          color: isBusy ? 'var(--text-3)' : 'var(--accent)',
                          border: '1px solid var(--ink)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10, letterSpacing: '0.16em', fontWeight: 700,
                          padding: '8px 12px',
                          cursor: isBusy ? 'wait' : 'pointer',
                          textTransform: 'uppercase',
                          transition: 'background 120ms ease',
                        }}
                      >
                        {isBusy ? 'BURNING…' : `BURN · +${reward} BUSTS`}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Branded burn-confirm modal — replaces window.confirm() */}
      {confirmItem ? (
        <BurnConfirmModal
          item={confirmItem}
          onConfirm={() => doBurn(confirmItem)}
          onCancel={() => setConfirmItem(null)}
        />
      ) : null}
    </div>
  );
}

// Branded confirm modal for burn actions. Editorial paper card on a
// dimmed dark backdrop, lime accent, irreversibility warning, kbd
// hints. Esc/Enter wired in TraitInventorySection's effect.
function BurnConfirmModal({ item, onConfirm, onCancel }) {
  const reward = BURN_REWARD[item.rarity] || 10;
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(10,10,10,0.72)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        zIndex: 9999,
        animation: 'burn-modal-fade 160ms ease-out',
      }}
    >
      <style>{`
        @keyframes burn-modal-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes burn-modal-pop {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        /* Mobile: stack the footer vertically, hide the kbd hint
           (no keyboard on touch), and make Cancel + Burn share the
           bottom row at full width so the Burn button never overflows. */
        @media (max-width: 540px) {
          .burn-modal-card { max-width: none !important; }
          .burn-modal-footer {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 10px !important;
          }
          .burn-modal-kbd { display: none !important; }
          .burn-modal-actions {
            display: flex !important;
            gap: 8px !important;
            width: 100% !important;
          }
          .burn-modal-actions button { flex: 1 !important; padding: 14px 12px !important; }
          .burn-modal-headline { font-size: 26px !important; }
          .burn-modal-reward-amount { font-size: 24px !important; }
          .burn-modal-reward { padding: 12px 14px !important; }
          .burn-modal-body { padding: 16px 18px !important; }
          .burn-modal-header { padding: 16px 18px 12px !important; }
        }
      `}</style>

      <div
        className="burn-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: 'var(--paper)',
          border: '1px solid var(--ink)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px var(--ink)',
          animation: 'burn-modal-pop 200ms cubic-bezier(.2,.8,.2,1)',
          position: 'relative',
        }}
      >
        {/* Lime accent rail */}
        <span style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: 4, background: 'var(--accent)',
        }} />

        {/* Header */}
        <div className="burn-modal-header" style={{
          padding: '20px 24px 14px',
          borderBottom: '1px solid var(--hairline)',
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10, letterSpacing: '0.3em',
            color: 'var(--text-3)',
          }}>
            BURN · IRREVERSIBLE
          </div>
          <div className="burn-modal-headline" style={{
            marginTop: 6,
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontSize: 30,
            letterSpacing: '-0.5px',
            color: 'var(--ink)',
            lineHeight: 1.05,
          }}>
            Burn this trait?
          </div>
        </div>

        {/* Body */}
        <div className="burn-modal-body" style={{ padding: '20px 24px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '64px 1fr',
            gap: 14,
            alignItems: 'center',
            padding: 14,
            border: '1px solid var(--hairline)',
            background: 'var(--paper-2)',
          }}>
            <div style={{
              width: 64, height: 64,
              background: 'var(--paper)',
              border: '1px solid var(--hairline)',
              overflow: 'hidden',
            }}>
              <svg viewBox="0 0 96 96" width="64" height="64" shapeRendering="crispEdges"
                dangerouslySetInnerHTML={{ __html: getElementSVG(item.type, item.variant) }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontSize: 22,
                color: 'var(--ink)',
                lineHeight: 1.1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{item.name}</div>
              <div style={{
                marginTop: 4,
                fontFamily: 'var(--font-mono)',
                fontSize: 9, letterSpacing: '0.22em',
                color: 'var(--text-3)',
              }}>
                {item.rarity.toUpperCase().replace('_', ' ')} · {ELEMENT_LABELS[item.type].toUpperCase()}
                {item.quantity > 1 ? <> · YOU HOLD {item.quantity}</> : null}
              </div>
            </div>
          </div>

          {/* Reward callout */}
          <div className="burn-modal-reward" style={{
            marginTop: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 16px',
            background: 'var(--ink)',
            color: 'var(--paper)',
          }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10, letterSpacing: '0.24em',
              color: 'var(--accent)',
            }}>YOU RECEIVE</span>
            <span className="burn-modal-reward-amount" style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontSize: 28,
              color: 'var(--accent)',
              lineHeight: 1,
              fontFeatureSettings: '"tnum"',
            }}>
              +{reward} <span style={{ fontFamily: 'var(--font-mono)', fontStyle: 'normal', fontSize: 11, letterSpacing: '0.2em', color: 'var(--paper)', marginLeft: 6 }}>BUSTS</span>
            </span>
          </div>

          <p style={{
            marginTop: 14,
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontSize: 14,
            color: 'var(--text-3)',
            lineHeight: 1.45,
          }}>
            The trait is destroyed and removed from your inventory. The drop is closed, so this BUSTS payout is the trait's last utility. Cannot be undone.
          </p>
        </div>

        {/* Footer / actions */}
        <div className="burn-modal-footer" style={{
          display: 'flex', gap: 8,
          padding: '14px 24px 20px',
          borderTop: '1px solid var(--hairline)',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}>
          <span className="burn-modal-kbd" style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9, letterSpacing: '0.2em',
            color: 'var(--text-4)',
          }}>
            ESC TO CANCEL · ENTER TO CONFIRM
          </span>
          <div className="burn-modal-actions" style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onCancel}
              style={{
                background: 'transparent',
                border: '1px solid var(--ink)',
                color: 'var(--ink)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11, letterSpacing: '0.18em', fontWeight: 700,
                padding: '10px 16px',
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >Cancel</button>
            <button
              onClick={onConfirm}
              autoFocus
              style={{
                background: 'var(--accent)',
                border: '1px solid var(--ink)',
                color: 'var(--ink)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11, letterSpacing: '0.18em', fontWeight: 700,
                padding: '10px 18px',
                cursor: 'pointer',
                textTransform: 'uppercase',
                boxShadow: '0 4px 16px rgba(215,255,58,0.35)',
              }}
            >Burn · +{reward} BUSTS</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GiftSection({ inventory, pendingGifts, xUser, sendGift, claimGift, completedNFTs }) {
  const toast = useToast();
  const [toUsername, setToUsername] = useState('');
  const [selected, setSelected]     = useState(null);
  const [sendQty, setSendQty]       = useState(1);
  const [sending, setSending]       = useState(false);

  // (type:variant) keys for traits used in the user's built portrait.
  // Used as a VISUAL LABEL only — the row in inventory means the user
  // owns a spare copy (otherwise it would have qty 0 and be deleted),
  // so gifting the spare is allowed. The "FROZEN" badge just tells
  // the holder "this is the trait you minted with" so they don't gift
  // their last copy without realizing.
  const frozenKeys = useMemo(() => {
    const set = new Set();
    for (const nft of completedNFTs || []) {
      const els = nft?.elements || {};
      for (const [type, variant] of Object.entries(els)) {
        set.add(`${type}:${variant}`);
      }
    }
    return set;
  }, [completedNFTs]);
  const isFrozen = (item) => frozenKeys.has(`${item.type}:${item.variant}`);

  // Server already filters pending_gifts by the current user's handle +
  // unclaimed-only. No additional filter needed here — the previous code
  // filtered by a nonexistent `g.toXUsername` field and hid every gift.
  const myInbox = pendingGifts.filter((g) => !g.claimed);

  const selectedInvRow = selected
    ? inventory.find((i) => i.type === selected.type && i.variant === selected.variant)
    : null;
  const maxQty = selectedInvRow?.quantity || 1;

  useEffect(() => { setSendQty(1); }, [selected?.type, selected?.variant]);

  const handleSend = async () => {
    if (!selected || !toUsername.trim() || sending) return;
    const clean = normalizeXHandle(toUsername);
    if (!clean || !isValidXHandle(clean)) {
      toast.error('Enter a valid X handle (letters, digits, underscore).');
      return;
    }
    if (xUser?.username && clean === normalizeXHandle(xUser.username)) {
      toast.error('You cannot gift yourself.');
      return;
    }
    const count = Math.max(1, Math.min(sendQty, maxQty));
    const elementSnapshot = { ...selected };

    setSending(true);
    let sent = 0;
    let lastError = null;
    try {
      for (let i = 0; i < count; i++) {
        const r = await sendGift(clean, elementSnapshot);
        if (r?.ok) {
          sent++;
        } else {
          // Surface the ACTUAL server error so we can see what's failing
          lastError = r?.reason || r?.error || `HTTP ${r?.status || '?'}`;
          break;
        }
      }
    } catch (e) {
      lastError = e?.message || 'network error';
    } finally {
      setSending(false);
    }

    if (sent > 0) {
      toast.success(`Sent ${sent}× ${elementSnapshot.name} to @${clean}`);
      setSelected(null);
      setSendQty(1);
      setToUsername('');
    }
    if (lastError) {
      // Keep the form populated so user can retry
      toast.error(`Gift failed (${lastError})`);
      console.error('[gift-send]', { clean, elementSnapshot, count, sent, lastError });
    } else if (sent === 0) {
      toast.error('Gift did not send — check console');
    }
  };

  const handleClaim = async (gift) => {
    const r = await claimGift(gift.id);
    if (r?.ok) {
      toast.success(`Claimed ${gift.elementName}`);
    } else {
      toast.error(r?.reason || 'Claim failed');
    }
  };

  return (
    <div className="gift-section">
      <div className="gift-card">
        <div className="gift-card-title">Send elements</div>
        <div className="gift-card-sub">Pick an element (trait) from your inventory and send it to an @X username. They claim it from their Dashboard.</div>

        <div className="gift-form">
          <div>
            <label>Recipient @username</label>
            <input
              type="text"
              value={toUsername}
              onChange={(e) => setToUsername(e.target.value)}
              placeholder="@vitalik"
              style={{ marginTop: 6, width: '100%' }}
            />
            {toUsername.trim() && (() => {
              const preview = normalizeXHandle(toUsername);
              if (!preview) return null;
              const valid = isValidXHandle(preview);
              return (
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 6,
                  color: valid ? 'var(--text-3)' : 'var(--red, #c4352b)',
                }}>
                  {valid ? `Will send to @${preview}` : 'Not a valid handle'}
                </div>
              );
            })()}
          </div>

          <div>
            <label>Element to send</label>
            <div className="gift-trait-grid">
              {inventory.length === 0 ? (
                <div className="gift-row-empty" style={{ gridColumn: '1/-1' }}>No elements to send.</div>
              ) : (
                inventory.map((item) => {
                  const isSelected = selected?.type === item.type && selected?.variant === item.variant;
                  const usedInBuild = isFrozen(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelected({ type: item.type, variant: item.variant, name: item.name, rarity: item.rarity });
                      }}
                      className={`gift-trait-card${isSelected ? ' selected' : ''}`}
                      title={usedInBuild ? 'This trait is in your built bust. The row in inventory is a spare copy and can be gifted.' : undefined}
                    >
                      <div className="gift-trait-art">
                        <svg
                          viewBox="0 0 100 100"
                          xmlns="http://www.w3.org/2000/svg"
                          shapeRendering="crispEdges"
                          dangerouslySetInnerHTML={{ __html: getElementSVG(item.type, item.variant) }}
                        />
                        {item.quantity > 1 && (
                          <span className="gift-trait-qty">×{item.quantity}</span>
                        )}
                        {usedInBuild && (
                          <span className="gift-trait-frozen-badge">USED IN BUST</span>
                        )}
                      </div>
                      <div className="gift-trait-info">
                        <div className="gift-trait-type">{(ELEMENT_LABELS[item.type] || item.type).toUpperCase()}</div>
                        <div className="gift-trait-name">{item.name}</div>
                        {usedInBuild && (
                          <div className="gift-trait-frozen-note">Spare copy · giftable</div>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {selected && (
            <div className="gift-qty-row">
              <div>
                <div className="gift-qty-label">How many to send</div>
                <div className="gift-qty-sub">
                  You own {maxQty}× {selected.name}. Choose how many copies to send.
                </div>
              </div>
              <div className="gift-qty-stepper">
                <button
                  type="button"
                  className="gift-qty-btn"
                  onClick={() => setSendQty((q) => Math.max(1, q - 1))}
                  disabled={sendQty <= 1}
                >−</button>
                <span className="gift-qty-value">{sendQty}</span>
                <button
                  type="button"
                  className="gift-qty-btn"
                  onClick={() => setSendQty((q) => Math.min(maxQty, q + 1))}
                  disabled={sendQty >= maxQty}
                >+</button>
                <span className="gift-qty-max">of {maxQty}</span>
              </div>
            </div>
          )}

          <button
            className="btn btn-solid btn-arrow"
            disabled={!selected || !toUsername.trim() || sending}
            onClick={handleSend}
          >
            {sending ? 'Sending.' : sendQty > 1 ? `Send ${sendQty} elements` : 'Send Element'}
          </button>
        </div>
      </div>

      <div className="gift-card">
        <div className="gift-card-title">Element inbox</div>
        <div className="gift-card-sub">Elements (traits) sent to your @X username show up here. Claim to add them to your inventory.</div>

        <div className="gift-inbox">
          {myInbox.length === 0 ? (
            <div className="gift-row-empty">Nothing pending.</div>
          ) : (
            myInbox.map((gift) => (
              <div key={gift.id} className="gift-row">
                <div className="gift-row-art">
                  <svg
                    viewBox="0 0 100 100"
                    xmlns="http://www.w3.org/2000/svg"
                    shapeRendering="crispEdges"
                    dangerouslySetInnerHTML={{ __html: getElementSVG(gift.elementType, gift.variant) }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="gift-row-name">{gift.elementName}</div>
                  <div className="gift-row-from">
                    {(ELEMENT_LABELS[gift.elementType] || gift.elementType)}
                    {' · from @'}{gift.fromXUsername || 'anon'}
                  </div>
                </div>
                <button className="btn btn-solid btn-sm" onClick={() => handleClaim(gift)}>
                  Claim
                </button>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}

function BustsTransferSection({
  bustsBalance,
  pendingBustsTransfers,
  sendBusts,
  claimBustsTransfer,
  xUser,
}) {
  const toast = useToast();
  const [toUsername, setToUsername] = useState('');
  const [amountStr, setAmountStr]   = useState('');
  const [sending, setSending]       = useState(false);
  const [busyId, setBusyId]         = useState(null);

  const amount = Math.floor(Number(amountStr) || 0);
  const isAmountValid = amount >= 1 && amount <= bustsBalance;
  const remainingAfter = Math.max(0, bustsBalance - amount);

  const inbox = (pendingBustsTransfers || []);

  // Confirm-modal state. Wire is a two-step action now: clicking the
  // CTA validates inputs and opens the modal; the user must explicitly
  // confirm there before the API call fires. Prevents fat-finger sends
  // (esp. with the MAX chip + a typo'd handle).
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleAttemptSend = () => {
    if (sending) return;
    const clean = normalizeXHandle(toUsername);
    if (!clean || !isValidXHandle(clean)) {
      toast.error('Enter a valid X handle.');
      return;
    }
    if (xUser?.username && clean === normalizeXHandle(xUser.username)) {
      toast.error('You cannot send BUSTS to yourself.');
      return;
    }
    if (!isAmountValid) {
      toast.error(amount < 1 ? 'Minimum is 1 BUSTS.' : 'Amount exceeds your balance.');
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmSend = async () => {
    if (sending) return;
    const clean = normalizeXHandle(toUsername);
    setSending(true);
    const r = await sendBusts(clean, amount);
    setSending(false);
    if (r?.ok) {
      toast.success(`Sent ${r.amount.toLocaleString()} BUSTS to @${clean} · they claim from their inbox`);
      setToUsername('');
      setAmountStr('');
      setConfirmOpen(false);
    } else {
      toast.error(`Send failed (${r?.reason || 'unknown'})`);
      setConfirmOpen(false);
    }
  };

  const handleCancelSend = () => {
    if (sending) return;
    setConfirmOpen(false);
  };

  // ESC-to-dismiss while the modal is open
  useEffect(() => {
    if (!confirmOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') handleCancelSend(); };
    window.addEventListener('keydown', onKey);
    // Lock background scroll while open so a long inbox underneath
    // doesn't jiggle when the user taps confirm.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [confirmOpen, sending]);

  const handleClaim = async (t) => {
    setBusyId(t.id);
    const r = await claimBustsTransfer(t.id);
    setBusyId(null);
    if (r?.ok) toast.success(`+${r.amount} BUSTS from @${r.fromXUsername || 'anon'}`);
    else toast.error(r?.reason || 'Claim failed');
  };

  // Quick-pick chips — % of current balance. Empty when balance is 0.
  const chips = bustsBalance > 0
    ? [{ label: '25%', val: Math.floor(bustsBalance * 0.25) },
       { label: '50%', val: Math.floor(bustsBalance * 0.5) },
       { label: '75%', val: Math.floor(bustsBalance * 0.75) },
       { label: 'MAX', val: bustsBalance }]
    : [];

  const senderHandle = xUser?.username ? `@${normalizeXHandle(xUser.username)}` : 'YOU';
  const recipientPreview = toUsername.trim() ? `@${normalizeXHandle(toUsername)}` : null;
  const recipientValid   = !!(recipientPreview && isValidXHandle(normalizeXHandle(toUsername)));

  return (
    <div style={{ marginTop: 28, marginBottom: 36 }}>
      {/* Local CSS — responsive split, mono input restyle, chip hover */}
      <style>{`
        .wire-frame {
          border: 1px solid var(--ink);
          background: var(--paper-2);
          display: grid;
          grid-template-columns: 1.1fr 1px 0.9fr;
          position: relative;
          overflow: hidden;
        }
        .wire-frame::before {
          content: '';
          position: absolute;
          left: 0; top: 0;
          width: 100%; height: 4px;
          background: var(--accent);
        }
        .wire-divider { background: var(--hairline); }
        .wire-pane { padding: 30px 30px 28px; min-width: 0; }
        .wire-kicker {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.22em;
          color: var(--text-4);
          margin-bottom: 8px;
        }
        .wire-headline {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 36px;
          letter-spacing: -0.02em;
          color: var(--ink);
          line-height: 1.0;
          margin-bottom: 6px;
        }
        .wire-sub {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 14px;
          color: var(--text-3);
          line-height: 1.45;
          max-width: 460px;
        }
        .wire-flow {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 12px;
          align-items: center;
          margin: 22px 0 16px;
          padding: 12px 14px;
          background: var(--paper);
          border: 1px solid var(--hairline);
        }
        .wire-flow-cell {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.08em;
          color: var(--ink);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .wire-flow-cell .wfc-label {
          font-size: 9px;
          letter-spacing: 0.22em;
          color: var(--text-4);
          display: block;
          margin-bottom: 4px;
        }
        .wire-flow-arrow {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 22px;
          color: var(--ink);
          padding: 0 6px;
        }
        .wire-input {
          width: 100%;
          background: var(--paper);
          border: 1px solid var(--ink);
          padding: 14px 14px;
          font-family: var(--font-mono);
          font-size: 13px;
          letter-spacing: 0.04em;
          color: var(--ink);
          outline: none;
          box-sizing: border-box;
        }
        .wire-input::placeholder { color: var(--text-4); }
        .wire-input.amount {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 26px;
          letter-spacing: -0.01em;
          padding: 14px 16px;
        }
        .wire-input.invalid { border-color: #c4352b; }
        .wire-label {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.22em;
          color: var(--text-4);
          margin: 18px 0 8px;
          display: flex;
          justify-content: space-between;
          align-items: baseline;
        }
        .wire-label .wl-hint {
          color: var(--text-3);
          letter-spacing: 0.1em;
        }
        .wire-chips {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          margin-top: 8px;
        }
        .wire-chip {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.18em;
          font-weight: 700;
          padding: 9px 0;
          border: 1px solid var(--ink);
          background: var(--paper);
          color: var(--ink);
          cursor: pointer;
          transition: background 120ms ease;
          text-align: center;
        }
        .wire-chip:hover:not(:disabled) { background: var(--accent); }
        .wire-chip:disabled { opacity: 0.4; cursor: not-allowed; }
        .wire-cta {
          width: 100%;
          margin-top: 22px;
          padding: 16px 18px;
          background: var(--ink);
          color: var(--accent);
          border: 1px solid var(--ink);
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.22em;
          font-weight: 700;
          cursor: pointer;
          transition: background 120ms ease, color 120ms ease;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
        }
        .wire-cta:hover:not(:disabled) { background: var(--accent); color: var(--ink); }
        .wire-cta:disabled { opacity: 0.45; cursor: not-allowed; }
        .wire-cta-arrow {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 18px;
          letter-spacing: -0.02em;
        }
        .wire-meta {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.16em;
          color: var(--text-3);
          margin-top: 10px;
        }
        .wire-meta.bad { color: #c4352b; }
        .wire-inbox-list {
          margin-top: 18px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-height: 360px;
          overflow-y: auto;
        }
        .wire-inbox-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 14px;
          align-items: center;
          padding: 14px 14px 14px 16px;
          background: var(--paper);
          border: 1px solid var(--ink);
          position: relative;
        }
        .wire-inbox-row::before {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 4px;
          background: var(--accent);
        }
        .wire-inbox-amount {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 22px;
          color: var(--ink);
          letter-spacing: -0.01em;
          line-height: 1.05;
        }
        .wire-inbox-from {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.16em;
          color: var(--text-3);
          margin-top: 4px;
          text-transform: uppercase;
        }
        .wire-inbox-claim {
          background: var(--ink);
          color: var(--accent);
          border: 1px solid var(--ink);
          padding: 10px 14px;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.18em;
          font-weight: 700;
          cursor: pointer;
          transition: background 120ms ease, color 120ms ease;
        }
        .wire-inbox-claim:hover:not(:disabled) { background: var(--accent); color: var(--ink); }
        .wire-inbox-claim:disabled { opacity: 0.5; cursor: not-allowed; }
        .wire-empty {
          padding: 28px 18px;
          text-align: center;
          background: var(--paper);
          border: 1px dashed var(--hairline);
        }
        .wire-empty-line {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 20px;
          color: var(--ink);
          margin-bottom: 6px;
        }
        .wire-empty-sub {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.2em;
          color: var(--text-3);
        }
        .wire-count-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--accent);
          border: 1px solid var(--ink);
          color: var(--ink);
          padding: 3px 8px;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.18em;
          font-weight: 700;
          margin-left: 10px;
        }
        @media (max-width: 880px) {
          .wire-frame { grid-template-columns: 1fr; }
          .wire-divider { width: 100%; height: 1px; }
          .wire-pane { padding: 24px 22px; }
          .wire-headline { font-size: 30px; }
        }
        @media (max-width: 460px) {
          .wire-pane { padding: 22px 18px; }
          .wire-headline { font-size: 26px; }
          .wire-flow { grid-template-columns: 1fr; }
          .wire-flow-arrow { display: none; }
        }

        /* ── Confirm modal ── */
        @keyframes wire-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes wire-pop-in {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .wire-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(14, 14, 14, 0.62);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          z-index: 1000;
          animation: wire-fade-in 180ms ease;
        }
        .wire-modal {
          position: relative;
          background: var(--paper);
          border: 1px solid var(--ink);
          width: 100%;
          max-width: 520px;
          padding: 36px 36px 30px;
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.18);
          animation: wire-pop-in 220ms cubic-bezier(.2,.8,.2,1);
        }
        .wire-modal::before {
          content: '';
          position: absolute;
          left: 0; top: 0; right: 0;
          height: 5px;
          background: var(--accent);
        }
        .wire-modal-close {
          position: absolute;
          top: 14px; right: 14px;
          width: 30px; height: 30px;
          background: transparent;
          border: 1px solid var(--hairline);
          color: var(--text-3);
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: 14px;
          line-height: 1;
          transition: background 120ms, color 120ms, border-color 120ms;
          display: flex; align-items: center; justify-content: center;
        }
        .wire-modal-close:hover { background: var(--ink); color: var(--accent); border-color: var(--ink); }
        .wire-modal-kicker {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.22em;
          color: var(--text-4);
          margin-bottom: 8px;
        }
        .wire-modal-headline {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 34px;
          letter-spacing: -0.02em;
          color: var(--ink);
          line-height: 1.0;
          margin-bottom: 18px;
        }
        .wire-modal-recap {
          background: var(--paper-2);
          border: 1px solid var(--ink);
          padding: 20px 22px;
          margin: 6px 0 22px;
        }
        .wire-modal-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 14px;
          padding: 12px 0;
          border-bottom: 1px dashed var(--hairline);
        }
        .wire-modal-row:last-child { border-bottom: none; }
        .wire-modal-row.first { padding-top: 0; }
        .wire-modal-row .wmr-label {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.22em;
          color: var(--text-4);
          flex: 0 0 auto;
        }
        .wire-modal-row .wmr-value {
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.05em;
          color: var(--ink);
          text-align: right;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        }
        .wire-modal-row .wmr-value.italic {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 26px;
          letter-spacing: -0.01em;
          line-height: 1;
        }
        .wire-modal-flow {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 14px;
          align-items: center;
          margin-bottom: 18px;
        }
        .wire-modal-flow .wmf-cell {
          background: var(--paper-2);
          border: 1px solid var(--hairline);
          padding: 12px 14px;
          min-width: 0;
        }
        .wire-modal-flow .wmf-label {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.22em;
          color: var(--text-4);
          display: block;
          margin-bottom: 4px;
        }
        .wire-modal-flow .wmf-handle {
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.05em;
          color: var(--ink);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .wire-modal-flow .wmf-arrow {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 24px;
          color: var(--ink);
          text-align: center;
        }
        .wire-modal-warn {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.16em;
          color: var(--text-3);
          text-align: center;
          margin-bottom: 18px;
          padding: 10px 12px;
          background: var(--paper-2);
          border-left: 3px solid var(--accent);
          line-height: 1.5;
        }
        .wire-modal-actions {
          display: grid;
          grid-template-columns: 1fr 1.4fr;
          gap: 10px;
        }
        .wire-modal-btn {
          padding: 16px 18px;
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.22em;
          font-weight: 700;
          cursor: pointer;
          transition: background 120ms, color 120ms;
          border: 1px solid var(--ink);
          display: flex; align-items: center; justify-content: center;
          gap: 10px;
        }
        .wire-modal-btn.cancel {
          background: var(--paper);
          color: var(--ink);
        }
        .wire-modal-btn.cancel:hover:not(:disabled) { background: var(--paper-3); }
        .wire-modal-btn.confirm {
          background: var(--ink);
          color: var(--accent);
        }
        .wire-modal-btn.confirm:hover:not(:disabled) { background: var(--accent); color: var(--ink); }
        .wire-modal-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .wire-modal-btn .arrow {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 18px;
          letter-spacing: -0.02em;
        }
        @media (max-width: 480px) {
          .wire-modal { padding: 28px 22px 22px; }
          .wire-modal-headline { font-size: 28px; }
          .wire-modal-flow { grid-template-columns: 1fr; }
          .wire-modal-flow .wmf-arrow { display: none; }
          .wire-modal-actions { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* ── Mr Prophet — full-width premium chatbot owns §02 ──
          Right-pane "Pending claims" was retired: registered recipients
          now auto-credit at send time (see api/_routes/busts-send.js)
          so the inbox/claim step is no longer the primary surface. The
          claim flow still works under the hood for unregistered handles
          on first sign-in. */}
      <ProphetInline />

      {/* ── Confirm modal — only mounted while open ── */}
      {confirmOpen ? (
        <div
          className="wire-modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) handleCancelSend(); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="wire-modal-title"
        >
          <div className="wire-modal">
            <button
              className="wire-modal-close"
              onClick={handleCancelSend}
              disabled={sending}
              aria-label="Cancel"
              type="button"
            >×</button>

            <div className="wire-modal-kicker">CONFIRM WIRE</div>
            <div className="wire-modal-headline" id="wire-modal-title">
              Send {amount.toLocaleString()} BUSTS?
            </div>

            <div className="wire-modal-flow">
              <div className="wmf-cell">
                <span className="wmf-label">FROM</span>
                <div className="wmf-handle">{senderHandle}</div>
              </div>
              <div className="wmf-arrow">→</div>
              <div className="wmf-cell">
                <span className="wmf-label">TO</span>
                <div className="wmf-handle">{recipientPreview || '—'}</div>
              </div>
            </div>

            <div className="wire-modal-recap">
              <div className="wire-modal-row first">
                <span className="wmr-label">AMOUNT</span>
                <span className="wmr-value italic">{amount.toLocaleString()}</span>
              </div>
              <div className="wire-modal-row">
                <span className="wmr-label">CURRENT BALANCE</span>
                <span className="wmr-value">{(bustsBalance || 0).toLocaleString()} BUSTS</span>
              </div>
              <div className="wire-modal-row">
                <span className="wmr-label">YOU'LL KEEP</span>
                <span className="wmr-value">{remainingAfter.toLocaleString()} BUSTS</span>
              </div>
            </div>

            <div className="wire-modal-warn">
              IF {recipientPreview || '@RECIPIENT'} ISN'T SIGNED UP, IT WAITS IN THEIR INBOX.<br />
              UNCLAIMED SENDS RETURN TO YOU AFTER 30 DAYS.
            </div>

            <div className="wire-modal-actions">
              <button
                className="wire-modal-btn cancel"
                onClick={handleCancelSend}
                disabled={sending}
                type="button"
              >CANCEL</button>
              <button
                className="wire-modal-btn confirm"
                onClick={handleConfirmSend}
                disabled={sending}
                type="button"
              >
                {sending ? 'WIRING…' : (
                  <>
                    <span>CONFIRM · WIRE {amount.toLocaleString()}</span>
                    <span className="arrow">→</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function timeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Twitter intent URLs for the three engagement actions. `handle` is
// the poster's @username (optional — only used for the reply UX).
function intentUrl(action, tweetId) {
  const id = encodeURIComponent(String(tweetId));
  if (action === 'like')  return `https://twitter.com/intent/like?tweet_id=${id}`;
  if (action === 'rt')    return `https://twitter.com/intent/retweet?tweet_id=${id}`;
  if (action === 'reply') return `https://twitter.com/intent/tweet?in_reply_to=${id}`;
  return null;
}

const ACTION_META = {
  like:  { label: 'Like the tweet',         openCta: 'Like on X',     doneCta: "I've liked it",    icon: '♥' },
  rt:    { label: 'Retweet',                openCta: 'Retweet on X',  doneCta: "I've retweeted",   icon: '↻' },
  reply: { label: 'Leave a comment',        openCta: 'Reply on X',    doneCta: "I've replied",     icon: '💬' },
};

// LocalStorage key per (user-session, task, action). We only persist the
// "opened on X" checkpoint — the authoritative state (pending/approved/
// rejected) lives on the server and comes back through task.myActions.
const OPENED_KEY = (taskId, action) => `t1969:task-opened:${taskId}:${action}`;

export function TasksTab() {
  const [tasks, setTasks]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(null); // `${taskId}:${action}` while submitting
  // Re-render bump when we touch localStorage so the button swaps shape
  const [openedTick, bumpOpened] = useState(0);
  const toast = useToast();

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/tasks-active', { credentials: 'same-origin' });
    const d = r.ok ? await r.json() : { tasks: [] };
    setTasks(d.tasks || []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const markOpened = (task, action) => {
    try { localStorage.setItem(OPENED_KEY(task.id, action), String(Date.now())); } catch { /* ignore */ }
    bumpOpened((n) => n + 1);
  };

  const wasOpened = (task, action) => {
    try { return !!localStorage.getItem(OPENED_KEY(task.id, action)); } catch { return false; }
  };

  const confirmDone = async (task, action) => {
    setBusy(`${task.id}:${action}`);
    const r = await fetch('/api/tasks-submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ taskId: task.id, action }),
    });
    // Always try to parse the body — error responses carry useful
    // payload like required / have for the follower gate.
    let d = {};
    try { d = await r.json(); } catch { d = {}; }
    setBusy(null);
    if (d.submitted) {
      toast.success(`Submitted for review · +${d.points} BUSTS pending`);
      refresh();
      return;
    }
    if (d.error === 'min_followers_not_met') {
      const need = Number(d.required) || 20;
      const have = Number(d.have) || 0;
      toast.error(`Tasks require at least ${need} followers on X. You have ${have}.`);
      return;
    }
    toast.error(d.error || 'Submit failed — try again');
  };

  return (
    <div>
      <div style={{ marginBottom: 32, maxWidth: 640 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, letterSpacing: '-0.03em', marginBottom: 10 }}>
          X engagement tasks.
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.55 }}>
          Complete each action on X first, then come back and confirm it here.
          Admins verify periodically and the BUSTS land in your balance on approval.
        </p>
      </div>

      {/* Follow task closed — server returns task_closed and the
          dashboard no longer renders the CTA so users don't click a
          button that doesn't do anything. */}
      {/* <FollowTaskCard /> */}

      {loading ? (
        <div className="gift-row-empty">Loading.</div>
      ) : tasks.length === 0 ? (
        <div className="gift-row-empty">No active tasks. Check back soon.</div>
      ) : (
        <div className="tasks-list">
          {tasks.map((t, idx) => (
            <div key={t.id} className="task-card task-card-pro">
              <div className="task-pro-head">
                <div>
                  <div className="task-head" style={{ marginBottom: 6 }}>
                    <span className="task-num">Task {String(idx + 1).padStart(2, '0')}</span>
                    <a
                      className="task-open-link"
                      href={t.tweetUrl}
                      target="_blank"
                      rel="noreferrer"
                    >View tweet ↗</a>
                  </div>
                  <div className="task-title">{t.description || `Engage with tweet ${t.tweetId}`}</div>
                  <div className="task-desc">
                    Reward pool: Like +{t.rewards.like} · RT +{t.rewards.rt} · Reply +{t.rewards.reply}
                    {t.rewards.trifecta ? ` · Trifecta bonus +${t.rewards.trifecta}` : ''}
                  </div>
                </div>
              </div>

              <div className="task-actions">
                {['like', 'rt', 'reply'].map((action) => {
                  const meta = ACTION_META[action];
                  const pts = t.rewards[action];
                  const status = t.myActions?.[action]; // 'pending' | 'approved' | 'rejected' | undefined
                  const k = `${t.id}:${action}`;
                  const opened = wasOpened(t, action);
                  // openedTick is referenced to bust memoization — otherwise
                  // the row doesn't re-render when localStorage flips.
                  void openedTick;

                  return (
                    <div key={action} className={`task-action-row status-${status || (opened ? 'ready' : 'idle')}`}>
                      <div className="task-action-label">
                        <span className="task-action-icon">{meta.icon}</span>
                        <div>
                          <div className="task-action-name">{meta.label}</div>
                          <div className="task-action-pts">+{pts} BUSTS</div>
                        </div>
                      </div>

                      <div className="task-action-cta">
                        {status === 'approved' ? (
                          <span className="task-action-badge approved">✓ Verified · +{pts}</span>
                        ) : status === 'pending' ? (
                          <span className="task-action-badge pending">● Waiting for verification</span>
                        ) : status === 'rejected' ? (
                          <span className="task-action-badge rejected">✕ Rejected</span>
                        ) : opened ? (
                          // Step 2 — user came back from X; now confirm
                          <button
                            className="btn btn-solid btn-sm btn-arrow"
                            onClick={() => confirmDone(t, action)}
                            disabled={busy === k}
                          >
                            {busy === k ? 'Submitting.' : meta.doneCta}
                          </button>
                        ) : (
                          // Step 1 — send them to X with the intent pre-filled
                          <a
                            className="btn btn-ghost btn-sm"
                            href={intentUrl(action, t.tweetId)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => markOpened(t, action)}
                          >
                            {meta.openCta} ↗
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Follow @the1969eth. One-shot task, +10 BUSTS. Intent-click trust
// signal like share-on-X. After claim the card flips to "followed" and
// is inert forever for this user.
// ══════════════════════════════════════════════════════════════════════
const FOLLOW_OPENED_KEY = 't1969:follow-opened';
const FOLLOW_HANDLE = 'the1969eth';
const FOLLOW_REWARD = 10;

function FollowTaskCard() {
  const toast = useToast();
  const { followClaimedAt, claimFollow, authenticated } = useGame();
  const [opened, setOpened] = useState(() => {
    try { return !!localStorage.getItem(FOLLOW_OPENED_KEY); } catch { return false; }
  });
  const [busy, setBusy] = useState(false);
  const claimed = !!followClaimedAt;

  const openIntent = () => {
    try { localStorage.setItem(FOLLOW_OPENED_KEY, String(Date.now())); } catch { /* noop */ }
    setOpened(true);
    window.open(
      `https://twitter.com/intent/follow?screen_name=${encodeURIComponent(FOLLOW_HANDLE)}`,
      '_blank'
    );
  };

  const markFollowed = async () => {
    if (!authenticated) {
      toast.error('Sign in with X first.');
      return;
    }
    setBusy(true);
    const r = await claimFollow();
    setBusy(false);
    if (!r?.ok) {
      toast.error(r?.reason || 'Could not claim reward. Try again.');
      return;
    }
    if (r.alreadyClaimed) {
      toast.info('Already claimed this reward.');
      return;
    }
    toast.success(`+${r.reward || FOLLOW_REWARD} BUSTS credited. Thanks for following.`);
  };

  return (
    <div className="task-card task-card-pro" style={{ marginBottom: 16 }}>
      <div className="task-pro-head">
        <div className="task-head" style={{ marginBottom: 6 }}>
          <span className="task-num">Task 00</span>
          <span className="task-open-link" style={{ textDecoration: 'none', cursor: 'default', pointerEvents: 'none' }}>
            Permanent · one-shot
          </span>
        </div>
        <div className="task-title">Follow @{FOLLOW_HANDLE} on X</div>
        <div className="task-desc">
          One click, one follow, one time. Keeps you wired into every drop, milestone, and holder spotlight.
        </div>
      </div>

      <div className="task-actions">
        <div className={`task-action-row status-${claimed ? 'approved' : opened ? 'ready' : 'idle'}`}>
          <div className="task-action-label">
            <span className="task-action-icon" aria-hidden>X</span>
            <div>
              <div className="task-action-name">Follow on X</div>
              <div className="task-action-pts">+{FOLLOW_REWARD} BUSTS</div>
            </div>
          </div>
          <div className="task-action-cta">
            {claimed ? (
              <span className="task-action-badge approved">✓ Followed · +{FOLLOW_REWARD}</span>
            ) : opened ? (
              <button
                className="btn btn-solid btn-sm btn-arrow"
                onClick={markFollowed}
                disabled={busy}
              >
                {busy ? 'Claiming.' : "I've followed"}
              </button>
            ) : (
              <button
                className="btn btn-ghost btn-sm"
                onClick={openIntent}
              >
                Open @{FOLLOW_HANDLE} ↗
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Discord connect card on the dashboard. Reads + writes status from
// /api/me. Toast comes from the redirect query string set by the
// callback (?discord=connected | error&reason=...).
// ─────────────────────────────────────────────────────────────────────
function ConnectDiscord({ username, inviteUrl }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const status = p.get('discord');
    if (!status) return;
    if (status === 'connected') {
      const u = p.get('username');
      const joined = p.get('joined') === '1';
      const jr = p.get('join_reason') || '';
      if (joined) {
        toast.success(u ? `Discord linked & joined as @${u}` : 'Discord linked & joined.');
      } else if (jr === 'server_cap') {
        toast.error(`Discord linked${u ? ` as @${u}` : ''}, but your account is at Discord's server limit. Leave a server you don't use, then click "Join the server".`);
      } else if (jr === 'verify_phone') {
        toast.error(`Discord linked${u ? ` as @${u}` : ''}, but our server requires a phone-verified Discord account. Verify your phone in Discord, then click "Join the server".`);
      } else if (jr) {
        toast.error(`Discord linked${u ? ` as @${u}` : ''}, but auto-join failed (${jr}). Click "Join the server" to retry.`);
      } else {
        toast.success(u ? `Discord linked as @${u}. Click "Join the server" to enter.` : 'Discord linked. Click "Join the server".');
      }
    } else if (status === 'error') {
      toast.error(`Discord link failed: ${p.get('reason') || 'unknown'}`);
    }
    const url = new URL(window.location.href);
    ['discord', 'username', 'reason', 'joined', 'join_reason'].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/discord-oauth-init', { credentials: 'same-origin' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) {
        // bad() writes { error, ...extra } — surface the real reason
        // so we don't get a generic "init_failed" mask.
        const reason = d?.error || d?.reason || `http_${r.status}`;
        throw new Error(reason);
      }
      window.location.href = d.url;
    } catch (e) {
      toast.error(`Could not start Discord link: ${e.message}`);
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 14, padding: '14px 18px', border: '1px solid var(--hairline)', background: 'var(--paper-2)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 6 }}>
        Discord
      </div>
      {username ? (
        <>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em' }}>
            ✓ @{username}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 4, marginBottom: 10 }}>
            Linked. Earn BUSTS by chatting in #general.
          </div>
          {inviteUrl ? (
            <a className="btn btn-accent btn-sm btn-arrow" href={inviteUrl} target="_blank" rel="noreferrer">
              Join the server
            </a>
          ) : null}
        </>
      ) : (
        <>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em' }}>
            Connect Discord
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 4, marginBottom: 10 }}>
            Earn BUSTS by chatting in #general. Auto-joins the official server.
          </div>
          <button className="btn btn-solid btn-sm btn-arrow" onClick={connect} disabled={busy}>
            {busy ? 'Loading.' : 'Connect Discord'}
          </button>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// One row inside the Shortcuts card. Hairline-separated, kicker label
// on top, title + meta below, optional count badge, chevron at right.
// ─────────────────────────────────────────────────────────────────────
function ShortcutRow({ kicker, title, meta, badge, onClick, last }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', textAlign: 'left',
        padding: '14px 18px',
        background: 'transparent', border: 'none',
        borderBottom: last ? 'none' : '1px solid var(--hairline)',
        cursor: 'pointer',
        font: 'inherit', color: 'inherit',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-dim)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 4,
        }}>
          {kicker}
        </div>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500,
          letterSpacing: '-0.01em', color: 'var(--ink)',
        }}>
          {title}
        </div>
        {meta ? (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
            {meta}
          </div>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {badge != null ? (
          <span style={{
            background: 'var(--accent)', color: 'var(--ink)',
            border: '1px solid var(--ink)',
            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
            padding: '2px 8px', minWidth: 22, textAlign: 'center',
          }}>
            {badge}
          </span>
        ) : null}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-3)' }}>›</span>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Mint wallet card. Three audience-specific copy variants:
//   built + no wallet  → GTD bind ("you built, lock your slot")
//   pre-WL + no built   → FCFS bind ("submit early, auto-promotes if you build")
//   neither             → mint-not-announced notice + scam warning
// When walletBound is true, the card collapses to a compact "✓ wallet
// bound for [tier]" status so users get confirmation without a CTA.
// ─────────────────────────────────────────────────────────────────────
function MintWalletCard({
  hasBuilt, isWhitelisted, dropEligible,
  walletBound, serverWalletAddress, xUsername,
  bindMintWallet, cutoffMs,
}) {
  const toast = useToast();
  const { address: wagmiAddress, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();
  const { disconnect } = useDisconnect();
  const [busy, setBusy] = useState(false);

  // Wallet-bind cutoff countdown. Tick every second so the displayed
  // "X hours, Y minutes, Z seconds" stays live without remounts.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!cutoffMs) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cutoffMs]);
  const cutoffPassed = !!cutoffMs && now >= cutoffMs;
  const cutoffSoon   = !!cutoffMs && !cutoffPassed && (cutoffMs - now) < 24 * 60 * 60 * 1000;
  const remaining = cutoffMs && !cutoffPassed ? cutoffMs - now : 0;
  const remD = Math.floor(remaining / 86400000);
  const remH = Math.floor((remaining / 3600000) % 24);
  const remM = Math.floor((remaining / 60000) % 60);
  const remS = Math.floor((remaining / 1000) % 60);

  // Tier the user lands on once their wallet is bound. Builders go to
  // Tier 1; pre-WL non-builders go to Tier 2. If they later build,
  // server state flips and they appear on Tier 1 on next /api/me load.
  const tier = (isWhitelisted || hasBuilt) ? 'Tier 1' : 'Tier 2';

  // Audience: who is this card speaking to right now?
  const audience =
    walletBound        ? 'bound'
    : (hasBuilt || isWhitelisted) ? 'built_no_wallet'
    : dropEligible     ? 'prewl_no_wallet'
    :                    'not_eligible';

  async function handleBind() {
    if (busy) return;
    if (cutoffPassed) {
      toast.error('Wallet submission has closed.');
      return;
    }
    setBusy(true);
    try {
      // Step 1: ensure a wagmi connection exists. RainbowKit's
      // useConnectModal returns openConnectModal = undefined when
      // wagmi already considers the wallet connected (e.g. cached
      // from a previous session, or a different X account). The
      // simple `if (openConnectModal) openConnectModal()` was a
      // silent no-op in that case — the toast appeared, no popup,
      // user got stuck. Fixed with the same fallback ladder used
      // in Nav.jsx:
      //   1. modal available → open it (normal path)
      //   2. wagmi already connected → open account modal so the
      //      user can disconnect from there
      //   3. account modal also missing → force a wagmi disconnect
      //      to reset state, ask the user to retry
      let address = wagmiAddress;
      if (!isConnected || !address) {
        if (openConnectModal) {
          openConnectModal();
          toast.info?.('Open the wallet connect popup, then click again to sign.');
        } else if (isConnected && openAccountModal) {
          openAccountModal();
          toast.info?.('Confirm or switch wallet in the account modal, then click again.');
        } else if (isConnected) {
          try { disconnect(); } catch (e) { console.warn('[mint-bind] disconnect failed:', e); }
          toast.info?.('Resetting wallet — try again in a moment.');
        } else {
          toast.error('Wallet connector unavailable. Refresh the page and try again.');
        }
        setBusy(false);
        return;
      }
      // Step 2: sign the canonical message proving wallet ownership.
      const message = mintBindMessage({ xUsername, walletAddress: address });
      const signature = await signMessageAsync({ message });
      // Step 3: server-side bind.
      const r = await bindMintWallet({ walletAddress: address, signature });
      if (r?.ok) {
        toast.success(
          r.tier === 'gtd'
            ? 'Wallet bound. You’re on Tier 1.'
            : 'Wallet bound. You’re on Tier 2. Build a portrait to upgrade to Tier 1.'
        );
      } else {
        toast.error(`Could not bind wallet: ${r?.reason || 'unknown'}`);
      }
    } catch (e) {
      console.warn('[mint-bind] failed:', e?.message || e);
      toast.error('Wallet bind cancelled or failed.');
    } finally {
      setBusy(false);
    }
  }

  // ── Compact bound state ─────────────────────────────────────────
  if (audience === 'bound') {
    const short = serverWalletAddress
      ? `${serverWalletAddress.slice(0, 6)}…${serverWalletAddress.slice(-4)}`
      : null;
    return (
      <div className="gift-card">
        <div className="gift-card-title">Mint wallet</div>
        <div className="gift-card-sub" style={{ marginBottom: 12 }}>
          You’re positioned for the upcoming mint. Mint date is not announced yet — watch <strong>@THE1969ETH</strong>.
        </div>
        <div style={{ padding: '14px 18px', border: '1px solid var(--hairline)', background: 'var(--paper-2)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 6 }}>
            Tier
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em' }}>
            ✓ {tier} mint
          </div>
          {short ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
              wallet {short}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // ── Not eligible: just an informational notice + scam warning ──
  if (audience === 'not_eligible') {
    return (
      <div className="gift-card">
        <div className="gift-card-title">Mint update</div>
        <div className="gift-card-sub" style={{ marginBottom: 12 }}>
          Mint date is not announced yet. The only official source is <strong>@THE1969ETH</strong>.
          We will never DM you, ask for your seed, or send pre-mint links.
        </div>
        <div style={{ padding: '14px 18px', border: '1px solid var(--hairline)', background: 'var(--paper-2)', fontSize: 13, color: 'var(--text-3)', lineHeight: 1.55 }}>
          To position for the mint:<br/>
          1. Apply for pre-whitelist when applications reopen, or<br/>
          2. Build a portrait via the hourly drop.<br/>
          Either path lets you bind a wallet here.
        </div>
      </div>
    );
  }

  // ── Active CTA: built-no-wallet OR prewl-no-wallet ─────────────
  const isBuilder = audience === 'built_no_wallet';
  return (
    <div className="gift-card">
      <div className="gift-card-title">
        {isBuilder ? 'Lock your Tier 1 mint slot' : 'Submit wallet for Tier 2 mint'}
      </div>
      <div className="gift-card-sub" style={{ marginBottom: 14 }}>
        {isBuilder ? (
          <>
            You’ve built your portrait but haven’t submitted a wallet yet. Connect now so we can position you for the Tier 1 mint.
            Mint date is not announced — watch <strong>@THE1969ETH</strong>.
          </>
        ) : (
          <>
            You’re pre-approved but haven’t built a portrait yet. Submit your wallet now to participate in the <strong>Tier 2</strong> mint. If you build a portrait before mint, your wallet auto-upgrades to <strong>Tier 1</strong>.
          </>
        )}
      </div>

      <div style={{ padding: '14px 18px', border: '1px solid var(--hairline)', background: 'var(--paper-2)', marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 6 }}>
          Current tier
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em' }}>
          {tier} mint
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
          {isBuilder ? 'Guaranteed slot once your wallet is bound.' : 'First-come, first-served once mint opens.'}
        </div>
      </div>

      {/* Countdown / closed banner */}
      {cutoffMs ? (
        cutoffPassed ? (
          <div style={{
            padding: '14px 18px', marginBottom: 14,
            border: '1px solid var(--ink)', background: 'var(--ink)', color: 'var(--paper)',
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 4, opacity: 0.7 }}>
              SUBMISSION CLOSED
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 18 }}>
              Wallet binding is locked.
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, opacity: 0.6, marginTop: 4 }}>
              The allowlist froze 6 hours before mint.
            </div>
          </div>
        ) : (
          <div style={{
            padding: '14px 18px', marginBottom: 14,
            border: `1px solid ${cutoffSoon ? 'var(--ink)' : 'var(--hairline)'}`,
            background: cutoffSoon ? 'rgba(215,255,58,0.12)' : 'var(--paper-2)',
          }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em',
              textTransform: 'uppercase', color: cutoffSoon ? 'var(--ink)' : 'var(--text-4)',
              marginBottom: 4, fontWeight: cutoffSoon ? 700 : 400,
            }}>
              {cutoffSoon ? 'CLOSING SOON · BIND NOW' : 'SUBMISSION CLOSES IN'}
            </div>
            <div style={{
              fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 500,
              fontSize: 28, letterSpacing: '-0.02em', color: 'var(--ink)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {remD > 0 ? `${remD}d ` : ''}{String(remH).padStart(2, '0')}h {String(remM).padStart(2, '0')}m {String(remS).padStart(2, '0')}s
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
              Wallet binding closes 6 hours before mint. The allowlist is frozen at that moment.
            </div>
          </div>
        )
      ) : null}

      <button className="btn btn-solid btn-sm btn-arrow" onClick={handleBind} disabled={busy || cutoffPassed}>
        {cutoffPassed
          ? 'Submission closed'
          : busy
            ? 'Working…'
            : (!isConnected ? 'Connect wallet' : 'Sign & submit')}
      </button>
    </div>
  );
}
