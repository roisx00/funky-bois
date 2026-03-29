import { useState, useMemo } from 'react';
import { useGame } from '../context/GameContext';
import ElementCard from '../components/ElementCard';
import { ELEMENT_LABELS, getElementSVG, ELEMENT_VARIANTS } from '../data/elements';

function timeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

const RARITY_ORDER = { ultra_rare: 0, legendary: 1, rare: 2, common: 3 };

const MOCK_GLOBAL_OFFERS = [
  { id: 'go-1', elementName: 'Skull Sticker', offerAmount: 650,  offererUsername: 'CosmicDegen8823', sellerUsername: 'PixelBoss0001',   listPrice: 800,  status: 'pending', createdAt: Date.now() - 600000   },
  { id: 'go-2', elementName: 'Laser Eyes',    offerAmount: 2200, offererUsername: 'NeonKing4451',    sellerUsername: 'CosmicRaver1122',  listPrice: 2500, status: 'pending', createdAt: Date.now() - 1200000  },
  { id: 'go-3', elementName: 'Storm BG',      offerAmount: 480,  offererUsername: 'GoldenBoi7733',   sellerUsername: 'ShadowKing9090',   listPrice: 600,  status: 'pending', createdAt: Date.now() - 2400000  },
  { id: 'go-4', elementName: 'Shades',        offerAmount: 390,  offererUsername: 'WildSauce2288',   sellerUsername: 'NeonDegen4451',    listPrice: 500,  status: 'accepted', createdAt: Date.now() - 3600000 },
  { id: 'go-5', elementName: 'Chains Outfit', offerAmount: 280,  offererUsername: 'ShadowNinja9090', sellerUsername: 'CryptoDrip7733',   listPrice: 350,  status: 'pending', createdAt: Date.now() - 4800000  },
];

const ACTIVITY_ICONS = { buy: '💰', sell: '🏷️', list: '📋', delist: '🔒', offer: '🤝' };
const MOCK_ACTIVITY = [
  { type: 'buy',    user: 'FunkyWizard8823', item: 'Flame Hair',       price: 2000, ts: Date.now() - 480000   },
  { type: 'list',   user: 'NeonDegen4451',   item: 'Shades',           price: 500,  ts: Date.now() - 720000   },
  { type: 'sell',   user: 'PixelBoss0001',   item: 'Skull Sticker',    price: 800,  ts: Date.now() - 1500000  },
  { type: 'offer',  user: 'CryptoDrip7733',  item: 'Laser Eyes',       price: 2200, ts: Date.now() - 2100000  },
  { type: 'delist', user: 'WildSauce2288',   item: 'Bowl Cut',         price: null, ts: Date.now() - 3000000  },
  { type: 'buy',    user: 'ShadowKing9090',  item: 'Storm Background', price: 600,  ts: Date.now() - 4200000  },
  { type: 'list',   user: 'GoldenNinja5577', item: 'Flame Hair',       price: 2200, ts: Date.now() - 5400000  },
  { type: 'offer',  user: 'ElectricChad1122',item: 'Chains Outfit',    price: 300,  ts: Date.now() - 7200000  },
  { type: 'sell',   user: 'MysticRaver5577', item: 'Dual Phones',      price: 80,   ts: Date.now() - 9000000  },
  { type: 'list',   user: 'CosmicDegen8823', item: 'Laser Eyes',       price: 2500, ts: Date.now() - 10800000 },
];

export default function MarketplacePage({ onNavigate }) {
  const {
    inventory, marketplace, userId, isWalletConnected, funkyBalance,
    connectWallet, walletSign, listElement, delistElement, buyElement,
    offers, makeOffer, cancelOffer, acceptIncomingOffer, declineOffer,
  } = useGame();

  const [tab, setTab] = useState('browse'); // 'browse' | 'offers' | 'activity'
  const [sellOpen, setSellOpen] = useState(false);

  // Browse filters/sort
  const [sortBy, setSortBy]         = useState('recent'); // 'recent' | 'price_asc' | 'price_desc' | 'rarity'
  const [filterType, setFilterType] = useState('');

  // Sell state
  const [selectedItem, setSelectedItem] = useState(null);
  const [priceInput, setPriceInput]     = useState('');
  const [listing, setListing]           = useState(false);

  // Buy / offer state
  const [buying, setBuying]             = useState(null); // listingId
  const [offerOpen, setOfferOpen]       = useState(null); // listingId
  const [offerInput, setOfferInput]     = useState('');
  const [submittingOffer, setSubmittingOffer] = useState(false);

  const [tip, setTip] = useState('');
  const showTip = (msg) => { setTip(msg); setTimeout(() => setTip(''), 5000); };

  const myListings    = marketplace.filter((l) => l.sellerUserId === userId);
  const otherListings = marketplace.filter((l) => l.sellerUserId !== userId);

  // Incoming offers on my listings
  const incomingOffers = offers.filter(
    (o) => myListings.some((l) => l.id === o.listingId) && o.status === 'pending'
  );
  // My outgoing offers
  const myOutgoingOffers = offers.filter((o) => o.offererUserId === userId);

  const offersTabCount = incomingOffers.length + myOutgoingOffers.filter((o) => o.status === 'pending').length;

  const allActivity = useMemo(() => {
    const real = [
      ...marketplace.filter((l) => l.sellerUserId === userId).map((l) => ({
        type: 'list', user: 'You', item: l.elementName, price: l.price, ts: l.listedAt,
      })),
    ];
    return [...real, ...MOCK_ACTIVITY].sort((a, b) => b.ts - a.ts);
  }, [marketplace, userId]);

  // Apply sort + filter to browse listings
  let browsable = [...otherListings];
  if (filterType) browsable = browsable.filter((l) => l.elementType === filterType);
  if (sortBy === 'price_asc')   browsable.sort((a, b) => a.price - b.price);
  if (sortBy === 'price_desc')  browsable.sort((a, b) => b.price - a.price);
  if (sortBy === 'recent')      browsable.sort((a, b) => b.listedAt - a.listedAt);
  if (sortBy === 'rarity') {
    browsable.sort((a, b) => {
      const ra = ELEMENT_VARIANTS[a.elementType]?.[a.variant]?.rarity || 'common';
      const rb = ELEMENT_VARIANTS[b.elementType]?.[b.variant]?.rarity || 'common';
      return (RARITY_ORDER[ra] ?? 3) - (RARITY_ORDER[rb] ?? 3);
    });
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleList = async () => {
    if (!selectedItem || !priceInput) return;
    const price = parseFloat(priceInput);
    if (isNaN(price) || price <= 0) return;
    if (!isWalletConnected) await connectWallet();
    setListing(true);
    const sig = await walletSign(`List ${selectedItem.name} for ${price} FUNKY on Funky Bois Marketplace`);
    if (!sig.ok) { setListing(false); showTip(`Sign failed: ${sig.reason}`); return; }
    listElement(selectedItem.type, selectedItem.variant, price);
    setListing(false);
    setSelectedItem(null);
    setPriceInput('');
    showTip(`Listed ${selectedItem.name} for ${price} FUNKY`);
    setTab('browse');
  };

  const handleDelist = async (listingId, name) => {
    const sig = await walletSign(`Delist ${name} from Funky Bois Marketplace`);
    if (!sig.ok) { showTip(`Sign failed: ${sig.reason}`); return; }
    delistElement(listingId);
    showTip(`${name} returned to your inventory`);
  };

  const handleBuy = async (l) => {
    if (!isWalletConnected) await connectWallet();
    if (funkyBalance < l.price) { showTip('Not enough FUNKY'); return; }
    setBuying(l.id);
    const sig = await walletSign(`Buy ${l.elementName} for ${l.price} FUNKY from ${l.sellerUsername}`);
    if (!sig.ok) { setBuying(null); showTip(`Sign failed: ${sig.reason}`); return; }
    buyElement(l.id);
    setBuying(null);
    showTip(`Purchased ${l.elementName}! Added to your collection.`);
  };

  const handleMakeOffer = async (l) => {
    const amount = parseFloat(offerInput);
    if (isNaN(amount) || amount <= 0) return;
    if (amount > funkyBalance) { showTip('Not enough FUNKY for this offer'); return; }
    if (!isWalletConnected) await connectWallet();
    setSubmittingOffer(true);
    const sig = await walletSign(`Offer ${amount} FUNKY for ${l.elementName} — Funky Bois`);
    if (!sig.ok) { setSubmittingOffer(false); showTip(`Sign failed: ${sig.reason}`); return; }
    makeOffer(l.id, amount);
    setSubmittingOffer(false);
    setOfferOpen(null);
    setOfferInput('');
    showTip(`Offer of ${amount} FUNKY submitted!`);
    setTab('offers');
  };

  const handleAcceptIncoming = async (offer) => {
    const sig = await walletSign(`Accept offer: ${offer.offerAmount} FUNKY for ${offer.elementName}`);
    if (!sig.ok) { showTip(`Sign failed: ${sig.reason}`); return; }
    acceptIncomingOffer(offer.id);
    showTip(`Accepted! ${offer.offerAmount} FUNKY received.`);
  };

  const handleDeclineIncoming = (offer) => {
    declineOffer(offer.id);
    showTip(`Offer declined.`);
  };

  const allElementTypes = [...new Set(marketplace.map((l) => l.elementType))].sort();

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1 className="page-title" style={{ borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>Marketplace</h1>
        <span style={{ fontFamily: 'var(--font-sketch)', fontSize: 22, color: 'var(--funky-gold)' }}>
          {funkyBalance.toLocaleString()} FUNKY ✦
        </span>
      </div>
      <div style={{ borderBottom: 'var(--border)', marginBottom: 24, paddingBottom: 0, marginTop: 8 }} />

      {tip && (
        <div style={{ marginBottom: 20, padding: '12px 16px', border: 'var(--border)', borderRadius: 4, background: 'var(--surface-2)', fontWeight: 600, fontSize: 14 }}>
          {tip}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', border: 'var(--border)', borderRadius: 6, marginBottom: 28, overflow: 'hidden', maxWidth: 460 }}>
        {[
          { id: 'browse',   label: `Browse (${otherListings.length})` },
          { id: 'offers',   label: `Offers${offersTabCount > 0 ? ` (${offersTabCount})` : ''}` },
          { id: 'activity', label: 'Activity' },
        ].map((t, i, arr) => (
          <button
            key={t.id}
            style={{
              flex: 1, padding: '11px 0', fontWeight: 700, fontSize: 13,
              background: tab === t.id ? 'var(--accent)' : 'var(--surface-2)',
              color: tab === t.id ? '#0A0A0A' : 'var(--text-2)',
              border: 'none', cursor: 'pointer',
              borderRight: i < arr.length - 1 ? '1px solid var(--border-color)' : 'none',
              transition: 'background 0.15s, color 0.15s',
            }}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Browse Tab ── */}
      {tab === 'browse' && (
        <>
          {/* My listings + List button row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{ padding: '8px 12px', border: 'var(--border)', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'var(--surface-2)', color: 'var(--text)' }}
              >
                <option value="recent">Most Recent</option>
                <option value="price_asc">Price: Low → High</option>
                <option value="price_desc">Price: High → Low</option>
                <option value="rarity">Rarity</option>
              </select>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                style={{ padding: '8px 12px', border: 'var(--border)', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'var(--surface-2)', color: 'var(--text)' }}
              >
                <option value="">All Types</option>
                {allElementTypes.map((t) => (
                  <option key={t} value={t}>{ELEMENT_LABELS[t] || t}</option>
                ))}
              </select>
            </div>
            <button
              className="btn btn-sm btn-solid"
              onClick={() => setSellOpen((o) => !o)}
            >
              {sellOpen ? 'Cancel' : '+ List Element'}
            </button>
          </div>

          {/* Inline sell panel */}
          {sellOpen && (
            <div style={{ border: '1px solid var(--border-color-med)', borderRadius: 8, padding: '20px 24px', marginBottom: 24, background: 'var(--surface-2)' }}>
              <h3 style={{ fontFamily: 'var(--font-sketch)', fontSize: 20, marginBottom: 14 }}>List an Element for Sale</h3>
              {myListings.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-3)', marginBottom: 8 }}>
                    Your Active Listings ({myListings.length})
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {myListings.map((l) => (
                      <div key={l.id} style={{ fontSize: 13, border: 'var(--border)', borderRadius: 4, padding: '6px 10px', display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontWeight: 700 }}>{l.elementName}</span>
                        <span style={{ color: 'var(--gold)' }}>{l.price} ✦</span>
                        <button className="btn btn-sm" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => handleDelist(l.id, l.elementName)}>Delist</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {inventory.length === 0 ? (
                <p style={{ color: 'var(--text-3)', fontSize: 14 }}>
                  No elements in inventory.{' '}
                  <span style={{ cursor: 'pointer', textDecoration: 'underline', color: 'var(--accent)' }} onClick={() => onNavigate('drop')}>Claim some →</span>
                </p>
              ) : (
                <>
                  <p style={{ fontWeight: 700, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, color: 'var(--text-3)' }}>Select element:</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
                    {inventory.map((item) => (
                      <ElementCard
                        key={item.id}
                        type={item.type}
                        variant={item.variant}
                        quantity={item.quantity}
                        selectable
                        selected={selectedItem?.type === item.type && selectedItem?.variant === item.variant}
                        onClick={() =>
                          setSelectedItem(
                            selectedItem?.type === item.type && selectedItem?.variant === item.variant
                              ? null
                              : { type: item.type, variant: item.variant, name: item.name, rarity: item.rarity }
                          )
                        }
                      />
                    ))}
                  </div>
                  {selectedItem && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <div>
                        <label style={{ display: 'block', fontWeight: 700, fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-3)' }}>
                          Price (FUNKY)
                        </label>
                        <input
                          type="number" step="1" min="1" placeholder="100"
                          value={priceInput}
                          onChange={(e) => setPriceInput(e.target.value)}
                          style={{ padding: '10px 14px', border: 'var(--border)', borderRadius: 4, fontSize: 16, fontWeight: 700, width: 140, background: 'var(--surface)', color: 'var(--text)' }}
                        />
                      </div>
                      <button className="btn btn-solid" onClick={handleList} disabled={listing || !priceInput}>
                        {listing ? 'Signing...' : `List ${selectedItem.name}`}
                      </button>
                    </div>
                  )}
                  <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10 }}>Listing requires a wallet signature.</p>
                </>
              )}
            </div>
          )}

          {/* Listings grid */}
          {browsable.length === 0 ? (
            <div className="collection-empty">No listings match your filter.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              {browsable.map((l) => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  canBuy
                  buying={buying === l.id}
                  canAfford={funkyBalance >= l.price}
                  onBuy={() => handleBuy(l)}
                  offerOpen={offerOpen === l.id}
                  offerInput={offerInput}
                  onOfferInputChange={setOfferInput}
                  onOfferToggle={() => { setOfferOpen(offerOpen === l.id ? null : l.id); setOfferInput(''); }}
                  onOfferSubmit={() => handleMakeOffer(l)}
                  submittingOffer={submittingOffer && offerOpen === l.id}
                  hasExistingOffer={offers.some((o) => o.listingId === l.id && o.offererUserId === userId && o.status === 'pending')}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Offers Tab ── */}
      {tab === 'offers' && (
        <div style={{ maxWidth: 680 }}>
          {/* Incoming on my listings */}
          {incomingOffers.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: 'var(--font-sketch)', fontSize: 22, marginBottom: 14, paddingBottom: 10, borderBottom: 'var(--border)' }}>
                Offers on My Listings ({incomingOffers.length})
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {incomingOffers.map((o) => (
                  <OfferRow key={o.id} offer={o} isIncoming
                    onAccept={() => handleAcceptIncoming(o)}
                    onDecline={() => handleDeclineIncoming(o)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* My outgoing offers */}
          {myOutgoingOffers.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: 'var(--font-sketch)', fontSize: 22, marginBottom: 14, paddingBottom: 10, borderBottom: 'var(--border)' }}>
                My Offers
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {myOutgoingOffers.map((o) => (
                  <OfferRow key={o.id} offer={o} onCancel={() => cancelOffer(o.id)} />
                ))}
              </div>
            </section>
          )}

          {/* Platform-wide offers */}
          <section>
            <h2 style={{ fontFamily: 'var(--font-sketch)', fontSize: 22, marginBottom: 6, paddingBottom: 10, borderBottom: 'var(--border)' }}>
              All Platform Offers
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 14 }}>Active offers across the marketplace</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {MOCK_GLOBAL_OFFERS.map((o) => (
                <div key={o.id} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  border: '1px solid var(--border-color-med)', borderRadius: 6, padding: '14px 18px',
                  background: 'var(--surface)', opacity: o.status !== 'pending' ? 0.5 : 1,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{o.elementName}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>
                      <strong>@{o.offererUsername}</strong> offers{' '}
                      <strong style={{ color: 'var(--gold)' }}>{o.offerAmount} FUNKY</strong>
                      {' '}to <strong>@{o.sellerUsername}</strong>{' '}
                      <span style={{ color: 'var(--text-3)' }}>(list: {o.listPrice})</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{timeAgo(o.createdAt)}</div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                    color: o.status === 'pending' ? 'var(--gold)' : o.status === 'accepted' ? 'var(--accent)' : 'var(--text-3)',
                  }}>
                    {o.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ── Activity Tab ── */}
      {tab === 'activity' && (
        <div style={{ maxWidth: 620 }}>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>Recent marketplace activity across all users</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {allActivity.map((ev, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px',
                background: 'var(--surface)',
                borderBottom: '1px solid var(--border-color)',
              }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{ACTIVITY_ICONS[ev.type] || '•'}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 700 }}>@{ev.user}</span>
                  {' '}
                  <span style={{ color: 'var(--text-2)' }}>
                    {ev.type === 'buy'    && 'bought'}
                    {ev.type === 'sell'   && 'sold'}
                    {ev.type === 'list'   && 'listed'}
                    {ev.type === 'delist' && 'delisted'}
                    {ev.type === 'offer'  && 'made an offer on'}
                  </span>
                  {' '}
                  <span style={{ fontWeight: 700 }}>{ev.item}</span>
                  {ev.price != null && (
                    <span style={{ color: 'var(--gold)', fontWeight: 700 }}> · {ev.price} FUNKY</span>
                  )}
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-3)', flexShrink: 0 }}>{timeAgo(ev.ts)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Listing Card ──────────────────────────────────────────────────────────────
function ListingCard({
  listing, isMine, canBuy, buying, canAfford = true, onBuy, onDelist,
  offerOpen, offerInput, onOfferInputChange, onOfferToggle, onOfferSubmit, submittingOffer,
  hasExistingOffer, incomingOffers = [], onAcceptOffer, onDeclineOffer,
}) {
  const info = ELEMENT_VARIANTS[listing.elementType]?.[listing.variant];
  const svg  = getElementSVG(listing.elementType, listing.variant);

  return (
    <div style={{
      border: '1px solid var(--border-color-med)', borderRadius: 6,
      background: 'var(--surface)', display: 'flex', flexDirection: 'column', transition: 'border-color 0.15s, box-shadow 0.15s',
    }}>
      {/* Art */}
      <div style={{
        background: 'var(--surface-2)', borderBottom: 'var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, height: 110, overflow: 'hidden', borderRadius: '4px 4px 0 0',
      }}>
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="80" height="80"
          dangerouslySetInnerHTML={{ __html: svg }} />
      </div>

      {/* Info */}
      <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#666' }}>
          {ELEMENT_LABELS[listing.elementType]}
        </div>
        <div style={{ fontWeight: 800, fontSize: 15 }}>{listing.elementName}</div>
        <div><span className={`badge badge-${info?.rarity || 'common'}`}>{info?.rarity}</span></div>
        <div style={{ fontSize: 11, color: '#999' }}>by {listing.sellerUsername} · {timeAgo(listing.listedAt)}</div>

        {/* Price row */}
        <div style={{ marginTop: 8 }}>
          <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 20, color: 'var(--funky-gold)', marginBottom: 8 }}>
            {listing.price} FUNKY
          </div>
          {isMine ? (
            <button className="btn btn-sm" onClick={onDelist} style={{ width: '100%' }}>Delist</button>
          ) : canBuy ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn btn-sm btn-solid"
                onClick={onBuy}
                disabled={buying || !canAfford}
                style={{ flex: 1, opacity: !canAfford ? 0.4 : 1 }}
                title={!canAfford ? 'Not enough FUNKY' : ''}
              >
                {buying ? '...' : 'Buy Now'}
              </button>
              <button
                className={`btn btn-sm${offerOpen ? ' btn-solid' : ''}`}
                onClick={onOfferToggle}
                style={{ flex: 1, background: offerOpen ? '#555' : undefined, color: offerOpen ? '#fff' : undefined }}
              >
                {hasExistingOffer && !offerOpen ? 'Offered' : offerOpen ? 'Cancel' : 'Offer'}
              </button>
            </div>
          ) : null}
        </div>

        {/* Offer input panel — stacked vertically, no overflow issues */}
        {offerOpen && (
          <div style={{ marginTop: 10, borderTop: 'var(--border)', paddingTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Your offer (FUNKY)
            </div>
            <input
              type="number"
              min="1"
              placeholder={listing.price}
              value={offerInput}
              onChange={(e) => onOfferInputChange(e.target.value)}
              style={{
                width: '100%', padding: '8px 10px', border: 'var(--border)',
                borderRadius: 4, fontSize: 14, fontWeight: 700,
                boxSizing: 'border-box', marginBottom: 6,
              }}
            />
            <button
              className="btn btn-sm btn-solid"
              onClick={onOfferSubmit}
              disabled={submittingOffer || !offerInput}
              style={{ width: '100%' }}
            >
              {submittingOffer ? 'Signing...' : 'Submit Offer'}
            </button>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
              List price: {listing.price} FUNKY
            </div>
          </div>
        )}

        {/* Incoming offers on my listing */}
        {isMine && incomingOffers.length > 0 && (
          <div style={{ marginTop: 10, borderTop: 'var(--border)', paddingTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Offers ({incomingOffers.length})
            </div>
            {incomingOffers.map((o) => (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                <span><strong>{o.offerAmount} FUNKY</strong> from @{o.offererUsername}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-sm btn-solid" style={{ padding: '3px 10px' }} onClick={() => onAcceptOffer(o)}>Accept</button>
                  <button className="btn btn-sm" style={{ padding: '3px 10px' }} onClick={() => onDeclineOffer(o)}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Offer Row ─────────────────────────────────────────────────────────────────
function OfferRow({ offer, isIncoming, onAccept, onDecline, onCancel }) {
  const statusColor = { pending: '#f59e0b', accepted: '#22c55e', declined: '#ef4444', cancelled: '#aaa' };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      border: '1px solid var(--border-color-med)', borderRadius: 6, padding: '14px 18px',
      background: 'var(--surface)',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{offer.elementName}</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>
          {isIncoming
            ? <><strong>@{offer.offererUsername}</strong> offers <strong style={{ color: 'var(--funky-gold)' }}>{offer.offerAmount} FUNKY</strong> (list: {offer.listPrice})</>
            : <>Offer on <strong>{offer.sellerUsername}</strong>'s listing — <strong style={{ color: 'var(--funky-gold)' }}>{offer.offerAmount} FUNKY</strong> of {offer.listPrice}</>
          }
        </div>
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>{timeAgo(offer.createdAt)}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
          color: statusColor[offer.status] || '#aaa',
        }}>
          {offer.status}
        </span>
        {isIncoming && offer.status === 'pending' && (
          <>
            <button className="btn btn-sm btn-solid" onClick={onAccept}>Accept</button>
            <button className="btn btn-sm" onClick={onDecline}>Decline</button>
          </>
        )}
        {!isIncoming && offer.status === 'pending' && (
          <button className="btn btn-sm" onClick={onCancel}>Cancel</button>
        )}
      </div>
    </div>
  );
}
