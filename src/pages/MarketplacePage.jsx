import { useState } from 'react';
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

export default function MarketplacePage({ onNavigate }) {
  const {
    inventory, marketplace, userId, isWalletConnected, funkyBalance,
    connectWallet, walletSign, listElement, delistElement, buyElement,
    offers, makeOffer, cancelOffer, acceptIncomingOffer, declineOffer,
  } = useGame();

  const [tab, setTab] = useState('browse'); // 'browse' | 'sell' | 'offers'

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
        <div style={{ marginBottom: 20, padding: '12px 16px', border: 'var(--border)', borderRadius: 4, background: '#f3f3f3', fontWeight: 600, fontSize: 14 }}>
          {tip}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', border: 'var(--border)', borderRadius: 4, marginBottom: 28, overflow: 'hidden', maxWidth: 420 }}>
        {[
          { id: 'browse', label: `Browse (${otherListings.length})` },
          { id: 'sell',   label: 'Sell'   },
          { id: 'offers', label: `Offers${offersTabCount > 0 ? ` (${offersTabCount})` : ''}` },
        ].map((t, i, arr) => (
          <button
            key={t.id}
            style={{
              flex: 1, padding: '11px 0', fontWeight: 700, fontSize: 13,
              background: tab === t.id ? '#000' : '#fff',
              color: tab === t.id ? '#fff' : '#000',
              border: 'none', cursor: 'pointer',
              borderRight: i < arr.length - 1 ? 'var(--border)' : 'none',
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
          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{ padding: '8px 12px', border: 'var(--border)', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              <option value="recent">Most Recent</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="rarity">Rarity</option>
            </select>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{ padding: '8px 12px', border: 'var(--border)', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              <option value="">All Types</option>
              {allElementTypes.map((t) => (
                <option key={t} value={t}>{ELEMENT_LABELS[t] || t}</option>
              ))}
            </select>
          </div>

          {browsable.length === 0 ? (
            <div className="collection-empty">No listings match your filter.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
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

      {/* ── Sell Tab ── */}
      {tab === 'sell' && (
        <div style={{ maxWidth: 680 }}>
          {/* My active listings */}
          {myListings.length > 0 && (
            <section style={{ marginBottom: 36 }}>
              <h2 style={{ fontFamily: 'var(--font-sketch)', fontSize: 22, marginBottom: 14, paddingBottom: 10, borderBottom: 'var(--border)' }}>
                My Active Listings ({myListings.length})
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
                {myListings.map((l) => {
                  const incoming = offers.filter((o) => o.listingId === l.id && o.status === 'pending');
                  return (
                    <ListingCard
                      key={l.id}
                      listing={l}
                      isMine
                      incomingOffers={incoming}
                      onDelist={() => handleDelist(l.id, l.elementName)}
                      onAcceptOffer={handleAcceptIncoming}
                      onDeclineOffer={handleDeclineIncoming}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {/* List new */}
          <h2 style={{ fontFamily: 'var(--font-sketch)', fontSize: 22, marginBottom: 14, paddingBottom: 10, borderBottom: 'var(--border)' }}>
            List an Element
          </h2>
          {inventory.length === 0 ? (
            <p style={{ color: '#777', fontSize: 14 }}>
              No elements in your inventory.{' '}
              <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => onNavigate('drop')}>
                Claim some in the Drop →
              </span>
            </p>
          ) : (
            <>
              <p style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
                Select element to list:
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12, marginBottom: 20 }}>
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
                    <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Price (FUNKY)
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      placeholder="100"
                      value={priceInput}
                      onChange={(e) => setPriceInput(e.target.value)}
                      style={{
                        padding: '10px 14px', border: 'var(--border)', borderRadius: 4,
                        fontSize: 16, fontWeight: 700, width: 140,
                        boxShadow: '2px 2px 0 #000',
                      }}
                    />
                  </div>
                  <button
                    className="btn btn-solid"
                    onClick={handleList}
                    disabled={listing || !priceInput}
                  >
                    {listing ? 'Signing...' : `List ${selectedItem.name}`}
                  </button>
                </div>
              )}

              <p style={{ fontSize: 12, color: '#888', marginTop: 12 }}>
                Listing requires a wallet signature to verify ownership.
              </p>
            </>
          )}
        </div>
      )}

      {/* ── Offers Tab ── */}
      {tab === 'offers' && (
        <div style={{ maxWidth: 620 }}>
          {/* Incoming offers on my listings */}
          {incomingOffers.length > 0 && (
            <section style={{ marginBottom: 36 }}>
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
          <section>
            <h2 style={{ fontFamily: 'var(--font-sketch)', fontSize: 22, marginBottom: 14, paddingBottom: 10, borderBottom: 'var(--border)' }}>
              My Offers
            </h2>
            {myOutgoingOffers.length === 0 ? (
              <p style={{ color: '#777', fontSize: 14 }}>
                You haven't made any offers yet.{' '}
                <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => setTab('browse')}>
                  Browse listings →
                </span>
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {myOutgoingOffers.map((o) => (
                  <OfferRow key={o.id} offer={o}
                    onCancel={() => cancelOffer(o.id)}
                  />
                ))}
              </div>
            )}
          </section>
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
      border: 'var(--border)', borderRadius: 4, boxShadow: '4px 4px 0 #000',
      overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column',
    }}>
      {/* Art */}
      <div style={{
        background: '#f3f3f3', borderBottom: 'var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, height: 110,
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

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 20, color: 'var(--funky-gold)' }}>
            {listing.price} FUNKY
          </div>
          {isMine ? (
            <button className="btn btn-sm" onClick={onDelist}>Delist</button>
          ) : canBuy ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn btn-sm btn-solid"
                onClick={onBuy}
                disabled={buying || !canAfford}
                style={{ opacity: !canAfford ? 0.4 : 1 }}
                title={!canAfford ? 'Not enough FUNKY' : ''}
              >
                {buying ? '...' : 'Buy Now'}
              </button>
              <button
                className={`btn btn-sm${offerOpen ? ' btn-solid' : ''}`}
                onClick={onOfferToggle}
                style={{ background: offerOpen ? '#555' : undefined }}
                title={hasExistingOffer ? 'You have an active offer' : 'Make an offer'}
              >
                {hasExistingOffer ? 'Offered' : 'Offer'}
              </button>
            </div>
          ) : null}
        </div>

        {/* Offer input panel */}
        {offerOpen && (
          <div style={{ marginTop: 10, borderTop: 'var(--border)', paddingTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Your offer (FUNKY)
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="number"
                min="1"
                placeholder={listing.price}
                value={offerInput}
                onChange={(e) => onOfferInputChange(e.target.value)}
                style={{
                  flex: 1, padding: '7px 10px', border: 'var(--border)',
                  borderRadius: 4, fontSize: 14, fontWeight: 700,
                }}
              />
              <button
                className="btn btn-sm btn-solid"
                onClick={onOfferSubmit}
                disabled={submittingOffer || !offerInput}
              >
                {submittingOffer ? '...' : 'Submit'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
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
      border: 'var(--border)', borderRadius: 4, padding: '14px 18px',
      background: '#fff', boxShadow: '3px 3px 0 #000',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{offer.elementName}</div>
        <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>
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
