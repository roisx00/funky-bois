import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAccount, useBalance, useSignMessage, useDisconnect } from 'wagmi';
import { useConnectModal, useAccountModal } from '@rainbow-me/rainbowkit';
import { useGame } from '../context/GameContext';
import { useToast } from '../components/Toast';
import ElementCard from '../components/ElementCard';
import { ELEMENT_TYPES, ELEMENT_LABELS, getElementSVG, buildNFTSVG } from '../data/elements';
import { normalizeXHandle, isValidXHandle } from '../utils/xHandle';
import { mintBindMessage } from '../utils/wlMessage';

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
      {/* ─── Header ─── */}
      <div className="dash-head">
        <div>
          <div className="dash-head-kicker">
            <span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--accent)', border: '1px solid var(--ink)', borderRadius: '50%', marginRight: 10, verticalAlign: 'middle' }} />
            {xUser ? `Signed in as @${xUser.username}` : 'Dashboard'}
          </div>
          <h1 className="dash-head-title">
            Your <em>command deck.</em>
          </h1>
        </div>

        <div className="dash-head-stats">
          <div className="dash-head-stat">
            <div className="dash-head-stat-label">Balance</div>
            <div className="dash-head-stat-value">{bustsBalance.toLocaleString()}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-4)', marginTop: 6, textTransform: 'uppercase' }}>BUSTS</div>
          </div>
          <div className="dash-head-stat">
            <div className="dash-head-stat-label">Traits</div>
            <div className="dash-head-stat-value">{progressCount}<span style={{ color: 'var(--text-4)' }}>/{TOTAL_TYPES}</span></div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-4)', marginTop: 6, textTransform: 'uppercase' }}>Types owned</div>
          </div>
          <div className="dash-head-stat">
            <div className="dash-head-stat-label">Status</div>
            <div className="dash-head-stat-value" style={{ fontSize: 20 }}>
              {isWhitelisted ? <span className="wl-secured-badge" style={{ padding: '6px 12px', fontSize: 10 }}>WL secured</span> : 'Not yet WL'}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-4)', marginTop: 6, textTransform: 'uppercase' }}>
              {completedNFTs.length} portrait{completedNFTs.length === 1 ? '' : 's'} built
            </div>
          </div>
        </div>
      </div>

      {/* ─── Unified dashboard (no tabs) — extras strip + section heads ─── */}
      <DashboardExtras
        completedNFTs={completedNFTs}
        bustsBalance={bustsBalance}
        walletAddress={serverWalletAddress}
        onNavigate={onNavigate}
      />

      {/* ─── §01 GIFT — BUSTS transfers only ─── */}
      {/* Element-trait gifting was retired: the drop is closed and the
          build cap is hit, so spare traits no longer help anyone build
          a portrait. BUSTS gifting stays — that still has utility for
          rewarding friends, settling debts, etc. */}
      <DashSectionHead n="01" title="Gift" sub="Send BUSTS to another holder. Pending claims appear here automatically." />
      <BustsTransferSection
        bustsBalance={bustsBalance}
        pendingBustsTransfers={pendingBustsTransfers}
        sendBusts={sendBusts}
        claimBustsTransfer={claimBustsTransfer}
        xUser={xUser}
      />

      <DashSectionHead n="02" title="Overview" />
      {true && (
        <div className="dash-overview-grid">
          {/* Mint wallet card — only shown to relevant audiences. The
              "Progress toward portrait" card is hidden once the user has
              built (it would just be a confusing wall of green checkmarks). */}
          <MintWalletCard
            hasBuilt={completedNFTs.length > 0}
            isWhitelisted={isWhitelisted}
            dropEligible={dropEligible === true}
            walletBound={walletBound === true}
            serverWalletAddress={serverWalletAddress}
            xUsername={xUser?.username}
            bindMintWallet={bindMintWallet}
            cutoffMs={mintWalletCutoffMs}
          />

          {completedNFTs.length === 0 && (
            <div className="gift-card">
              <div className="gift-card-title">Progress toward portrait</div>
              <div className="gift-card-sub">
                You've collected {progressCount} of {TOTAL_TYPES} trait types. Complete the set to build your portrait and unlock whitelist.
              </div>
              <div className="progress-bar-wrap" style={{ marginBottom: 20 }}>
                <div className="progress-bar-fill" style={{ width: `${(progressCount/TOTAL_TYPES)*100}%` }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {ELEMENT_TYPES.map((type) => {
                  const has = byType[type].length > 0;
                  return (
                    <div key={type} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 14px', border: '1px solid var(--hairline)',
                      background: has ? 'var(--accent-dim)' : 'var(--paper-2)',
                    }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', color: has ? 'var(--ink)' : 'var(--text-4)' }}>
                        {ELEMENT_LABELS[type]}
                      </span>
                      <span style={{ color: has ? 'var(--ink)' : 'var(--text-4)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                        {has ? '✓' : '/'}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                <button className="btn btn-solid btn-sm btn-arrow" onClick={() => onNavigate('drop')}>Go to drop</button>
                {hasAllTypes && <button className="btn btn-accent btn-sm" onClick={() => onNavigate('builder')}>Build portrait</button>}
              </div>
            </div>
          )}

          {/* Shortcut card retired — all four sections are visible inline below
              now that the tab system is removed. Keeping referrals stat. */}
          <div className="gift-card">
            <div className="gift-card-title">Activity</div>
            <div className="gift-card-sub" style={{ marginBottom: 18 }}>
              All your action surfaces are open below — tasks, gift, history. Scroll to skim.
            </div>
            <div style={{ padding: '14px 18px', border: '1px solid var(--hairline)', background: 'var(--paper-2)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 6 }}>Referrals</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, letterSpacing: '-0.025em' }}>
                {referralCount} joined
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>50 BUSTS per successful invite</div>
            </div>

            <ConnectDiscord username={discordUsername} inviteUrl={discordInviteUrl} />
          </div>
        </div>
      )}

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
      <DashSectionHead n="03" title="Activity history" sub="Most recent BUSTS ledger entries — credits in, debits out." />
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

      {/* ─── Top BUSTS holders (last 20) ─── */}
      <DashSectionHead n="04" title="Top holders" sub="Top 20 by BUSTS in circulation. Updated every 30 seconds." />
      <TopBustsHolders />
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
function DashboardExtras({ completedNFTs, bustsBalance, walletAddress }) {
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

  // NFT compact strip — pre-mint shows the user's builder portrait(s)
  // from completedNFTs. Post-mint: query the 1969 contract for owned
  // tokens. The contract is hardcoded as the canonical source of truth
  // (see project memory: 1969 NFT contract).
  const NFT_CONTRACT = '0x890db94d920bbf44862005329d7236cc7067efab';
  const [chainNftCount, setChainNftCount] = useState(null);
  useEffect(() => {
    if (!walletAddress) { setChainNftCount(null); return; }
    let cancelled = false;
    // ERC-721 balanceOf(address) — selector 0x70a08231, address padded to 32 bytes
    const data = '0x70a08231' + walletAddress.replace(/^0x/, '').padStart(64, '0');
    fetch('https://cloudflare-eth.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'eth_call',
        params: [{ to: NFT_CONTRACT, data }, 'latest'],
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.result) return;
        const n = Number(BigInt(d.result));
        setChainNftCount(n);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [walletAddress]);

  const [showAll, setShowAll] = useState(false);
  const portraits = completedNFTs || [];
  const totalNfts = chainNftCount != null ? chainNftCount : portraits.length;
  const visibleNfts = showAll ? portraits : portraits.slice(0, 6);

  const short = walletAddress
    ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
    : null;

  return (
    <>
      {/* ─── Metrics row — 4 tiles ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 1,
        background: 'var(--hairline)',
        border: '1px solid var(--hairline)',
        marginBottom: 28,
      }}>
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
          label="CONNECTED WALLET"
          value={short || '—'}
          sub={short ? 'bound · mint ready' : 'not bound'}
          mono
        />
      </div>

      {/* ─── Your 1969 NFTs — pre-mint placeholder ─── */}
      {/* Mint isn't live yet, so the on-chain reader has nothing to show.
          Once mint flips on (2026-05-01 14:00 UTC) the 1969 contract
          balanceOf will start returning real counts; until then this
          panel just announces the source of truth. We deliberately do
          NOT render builder portraits here — those aren't "1969 NFTs"
          yet, only inputs to one. */}
      <div style={{
        border: '1px solid var(--hairline)',
        background: 'var(--paper-2)',
        padding: '24px 24px',
        marginBottom: 28,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10, letterSpacing: '0.2em',
          color: 'var(--text-4)',
        }}>YOUR 1969 NFTS</div>

        <div style={{
          marginTop: 6,
          display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap',
        }}>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontSize: 28, fontWeight: 500,
            color: 'var(--ink)',
            letterSpacing: '-0.5px',
          }}>
            Detecting on-chain.
          </span>
          <span className="dash-detect-pulse" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: 10, letterSpacing: '0.22em',
            color: 'var(--ink)',
            background: 'var(--accent)',
            padding: '4px 10px',
            border: '1px solid var(--ink)',
            fontWeight: 700,
          }}>
            <span style={{
              display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
              background: 'var(--ink)',
            }} />
            SOON
          </span>
        </div>

        <p style={{
          marginTop: 10,
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
          fontSize: 16,
          color: 'var(--text-3)',
          lineHeight: 1.5,
          maxWidth: 560,
        }}>
          Mint opens 2026-05-01 14:00 UTC. Once you hold a 1969 NFT, this strip will read your wallet directly from the contract.
        </p>

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
    <div style={{
      background: 'var(--paper)',
      padding: '20px 18px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9, letterSpacing: '0.22em',
        color: 'var(--text-4)',
      }}>{label}</span>
      <span style={{
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-display)',
        fontStyle: mono ? 'normal' : 'italic',
        fontSize: mono ? 16 : 28,
        lineHeight: 1,
        color: 'var(--ink)',
        fontFeatureSettings: '"tnum"',
      }}>{value}</span>
      {sub ? (
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9, letterSpacing: '0.16em',
          color: 'var(--text-4)',
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

  const handleSend = async () => {
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
    setSending(true);
    const r = await sendBusts(clean, amount);
    setSending(false);
    if (r?.ok) {
      toast.success(`Sent ${r.amount.toLocaleString()} BUSTS to @${clean} · they claim from their inbox`);
      setToUsername('');
      setAmountStr('');
    } else {
      toast.error(`Send failed (${r?.reason || 'unknown'})`);
    }
  };

  const handleClaim = async (t) => {
    setBusyId(t.id);
    const r = await claimBustsTransfer(t.id);
    setBusyId(null);
    if (r?.ok) toast.success(`+${r.amount} BUSTS from @${r.fromXUsername || 'anon'}`);
    else toast.error(r?.reason || 'Claim failed');
  };

  return (
    <div className="gift-section" style={{ marginTop: 24 }}>
      <div className="gift-card">
        <div className="gift-card-title">Send BUSTS</div>
        <div className="gift-card-sub">
          Send BUSTS points to another @X handle. If they&apos;re already signed up, it lands instantly.
          Otherwise it waits in their inbox until they sign in. Minimum 1 · maximum is your current balance.
        </div>

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
            <label>Amount (BUSTS)</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <input
                type="number"
                min="1"
                step="1"
                max={bustsBalance}
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="100"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setAmountStr(String(bustsBalance))}
                disabled={bustsBalance <= 0}
              >Max</button>
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 6,
              color: isAmountValid || !amountStr ? 'var(--text-3)' : 'var(--red, #c4352b)',
            }}>
              Balance: {bustsBalance.toLocaleString()} BUSTS
              {amountStr && isAmountValid
                ? ` · you will have ${remainingAfter.toLocaleString()} left`
                : amountStr
                  ? (amount < 1 ? ' · minimum is 1' : ' · exceeds balance')
                  : ''}
            </div>
          </div>

          <button
            className="btn btn-solid btn-arrow"
            disabled={!toUsername.trim() || !isAmountValid || sending}
            onClick={handleSend}
          >
            {sending ? 'Sending.' : amount >= 1 ? `Send ${amount.toLocaleString()} BUSTS` : 'Send BUSTS'}
          </button>
        </div>
      </div>

      <div className="gift-card">
        <div className="gift-card-title">BUSTS inbox</div>
        <div className="gift-card-sub">
          BUSTS sent to your @X handle show up here. Claim to credit your balance.
          Unclaimed sends return to the sender after 30 days.
        </div>

        <div className="gift-inbox">
          {inbox.length === 0 ? (
            <div className="gift-row-empty">Nothing pending.</div>
          ) : (
            inbox.map((t) => (
              <div key={t.id} className="gift-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="gift-row-name">+{Number(t.amount).toLocaleString()} BUSTS</div>
                  <div className="gift-row-from">
                    From @{t.fromXUsername || 'anon'} · expires {timeAgo(t.expiresAt)}
                  </div>
                </div>
                <button
                  className="btn btn-solid btn-sm"
                  onClick={() => handleClaim(t)}
                  disabled={busyId === t.id}
                >
                  {busyId === t.id ? 'Claiming.' : 'Claim'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
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

      <FollowTaskCard />

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
