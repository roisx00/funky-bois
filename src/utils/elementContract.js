import { ethers } from 'ethers';

const ELEMENT_CONTRACT_ADDRESS = process.env.ELEMENT_CONTRACT_ADDRESS || process.env.VITE_ELEMENT_CONTRACT_ADDRESS || '';
const MARKETPLACE_CONTRACT_ADDRESS = process.env.MARKETPLACE_CONTRACT_ADDRESS || process.env.VITE_MARKETPLACE_CONTRACT_ADDRESS || '';
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC || process.env.VITE_SEPOLIA_RPC || '';

const ELEMENT_CONTRACT_ABI = [
  'function mint(address to, uint256 id, uint256 amount, bytes data) external',
  'function mintBatch(address to, uint256[] ids, uint256[] amounts, bytes data) external',
  'function setURI(string newUri) external',
  'function uri(uint256 tokenId) external view returns (string)',
  'function balanceOf(address account, uint256 id) external view returns (uint256)',
  'function setApprovalForAll(address operator, bool approved) external',
  'function isApprovedForAll(address account, address operator) external view returns (bool)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data) external',
];

const MARKETPLACE_CONTRACT_ABI = [
  'function createListing(uint256 _tokenId, uint256 _quantity, uint256 _pricePerToken) external',
  'function cancelListing(uint256 _listingId) external',
  'function buyTokens(uint256 _listingId, uint256 _quantity) external payable',
  'function makeOffer(uint256 _listingId) external payable',
  'function acceptOffer(uint256 _offerId) external',
  'function cancelOffer(uint256 _offerId) external',
  'function getListing(uint256 _listingId) external view returns (tuple(uint256 id, address seller, uint256 tokenId, uint256 quantity, uint256 pricePerToken, bool active, uint256 createdAt))',
  'function listingCounter() external view returns (uint256)',
  'function getOffer(uint256 _offerId) external view returns (tuple(uint256 id, address offerer, uint256 listingId, uint256 offerAmount, bool accepted, uint256 createdAt))',
  'function offerCounter() external view returns (uint256)',
];

export function getElementContract(signerOrProvider) {
  if (!ELEMENT_CONTRACT_ADDRESS) throw new Error('Element contract address not configured');
  return new ethers.Contract(ELEMENT_CONTRACT_ADDRESS, ELEMENT_CONTRACT_ABI, signerOrProvider);
}

export function getMarketplaceContract(signerOrProvider) {
  if (!MARKETPLACE_CONTRACT_ADDRESS) throw new Error('Marketplace contract address not configured');
  return new ethers.Contract(MARKETPLACE_CONTRACT_ADDRESS, MARKETPLACE_CONTRACT_ABI, signerOrProvider);
}

export async function getElementSigner() {
  if (!window.ethereum) throw new Error('No wallet provider');
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts', []);
  return provider.getSigner();
}

export function getSepoliaProvider() {
  if (!SEPOLIA_RPC_URL) {
    throw new Error('Sepolia RPC not configured for browser reads. Set SEPOLIA_RPC in .env');
  }
  return new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
}

export function getElementProvider() {
  if (!window.ethereum) throw new Error('No wallet provider');
  return new ethers.BrowserProvider(window.ethereum);
}

/**
 * Get all tokens owned by user across all element types
 */
export async function getUserTokens(userAddress) {
  const provider = getSepoliaProvider();
  const contract = getElementContract(provider);
  
  const tokens = [];
  // Check token IDs 1-147 (all element variants)
  for (let tokenId = 1; tokenId <= 147; tokenId++) {
    try {
      const balance = await contract.balanceOf(userAddress, tokenId);
      if (balance > 0n) {
        tokens.push({ tokenId, balance: balance.toString() });
      }
    } catch {
      // Token doesn't exist, continue
    }
  }
  
  return tokens;
}

function formatListing(rawListing) {
  return {
    listingId: Number(rawListing.id),
    seller: rawListing.seller,
    tokenId: Number(rawListing.tokenId),
    quantity: Number(rawListing.quantity),
    pricePerTokenWei: rawListing.pricePerToken.toString(),
    pricePerTokenEth: ethers.formatEther(rawListing.pricePerToken),
    active: rawListing.active,
    createdAt: Number(rawListing.createdAt) * 1000,
  };
}

export async function getMarketplaceListingCount() {
  const provider = getSepoliaProvider();
  const contract = getMarketplaceContract(provider);
  const count = await contract.listingCounter();
  return Number(count);
}

export async function getActiveMarketplaceListings() {
  const provider = getSepoliaProvider();
  const contract = getMarketplaceContract(provider);
  const total = await getMarketplaceListingCount();
  const listings = [];
  for (let listingId = 0; listingId < total; listingId++) {
    try {
      const listing = await contract.getListing(listingId);
      if (listing.active) {
        listings.push(formatListing(listing));
      }
    } catch (err) {
      console.error('Failed to fetch listing', listingId, err);
    }
  }
  return listings;
}

export async function getMyMarketplaceListings(userAddress) {
  const provider = getSepoliaProvider();
  const contract = getMarketplaceContract(provider);
  const total = await getMarketplaceListingCount();
  const listings = [];
  for (let listingId = 0; listingId < total; listingId++) {
    try {
      const listing = await contract.getListing(listingId);
      if (listing.seller.toLowerCase() === userAddress.toLowerCase() && listing.active) {
        listings.push(formatListing(listing));
      }
    } catch (err) {
      console.error('Failed to fetch listing', listingId, err);
    }
  }
  return listings;
}

export async function getMarketplaceOfferCount() {
  const provider = getSepoliaProvider();
  const contract = getMarketplaceContract(provider);
  const count = await contract.offerCounter();
  return Number(count);
}

export async function getOffersForListing(listingId) {
  const provider = getSepoliaProvider();
  const contract = getMarketplaceContract(provider);
  const total = await getMarketplaceOfferCount();
  const offers = [];
  for (let offerId = 0; offerId < total; offerId++) {
    try {
      const offer = await contract.getOffer(offerId);
      if (Number(offer.listingId) === listingId && !offer.accepted) {
        offers.push({
          offerId: Number(offer.id),
          offerer: offer.offerer,
          listingId: Number(offer.listingId),
          offerAmountWei: offer.offerAmount.toString(),
          offerAmountEth: ethers.formatEther(offer.offerAmount),
          accepted: offer.accepted,
          createdAt: Number(offer.createdAt) * 1000,
        });
      }
    } catch (err) {
      console.error('Failed to fetch offer', offerId, err);
    }
  }
  return offers;
}

export async function getMyOffers(userAddress) {
  const provider = getSepoliaProvider();
  const contract = getMarketplaceContract(provider);
  const total = await getMarketplaceOfferCount();
  const offers = [];
  for (let offerId = 0; offerId < total; offerId++) {
    try {
      const offer = await contract.getOffer(offerId);
      if (offer.offerer.toLowerCase() === userAddress.toLowerCase() && !offer.accepted) {
        offers.push({
          offerId: Number(offer.id),
          offerer: offer.offerer,
          listingId: Number(offer.listingId),
          offerAmountWei: offer.offerAmount.toString(),
          offerAmountEth: ethers.formatEther(offer.offerAmount),
          accepted: offer.accepted,
          createdAt: Number(offer.createdAt) * 1000,
        });
      }
    } catch (err) {
      console.error('Failed to fetch offer', offerId, err);
    }
  }
  return offers;
}

/**
 * List tokens for sale on marketplace
 */
export async function listTokenForSale(tokenId, quantity, pricePerTokenWei) {
  const signer = await getElementSigner();
  const userAddress = await signer.getAddress();
  
  // First ensure marketplace is approved to transfer tokens
  const elementContract = getElementContract(signer);
  const isApproved = await elementContract.isApprovedForAll(userAddress, MARKETPLACE_CONTRACT_ADDRESS);
  if (!isApproved) {
    const approveTx = await elementContract.setApprovalForAll(MARKETPLACE_CONTRACT_ADDRESS, true);
    await approveTx.wait();
  }
  
  // Create listing
  const marketplaceContract = getMarketplaceContract(signer);
  const tx = await marketplaceContract.createListing(tokenId, quantity, pricePerTokenWei);
  return tx.wait();
}

/**
 * Cancel a listing
 */
export async function cancelListing(listingId) {
  const signer = await getElementSigner();
  const marketplaceContract = getMarketplaceContract(signer);
  const tx = await marketplaceContract.cancelListing(listingId);
  return tx.wait();
}

/**
 * Buy tokens from marketplace
 */
export async function buyTokens(listingId, quantity, totalPriceWei) {
  const signer = await getElementSigner();
  const marketplaceContract = getMarketplaceContract(signer);
  const tx = await marketplaceContract.buyTokens(listingId, quantity, { value: totalPriceWei });
  return tx.wait();
}

/**
 * Make an offer on listing
 */
export async function makeOfferOnListing(listingId, offerAmountWei) {
  const signer = await getElementSigner();
  const marketplaceContract = getMarketplaceContract(signer);
  const tx = await marketplaceContract.makeOffer(listingId, { value: offerAmountWei });
  return tx.wait();
}

/**
 * Accept an offer as seller
 */
export async function acceptOfferOnListing(offerId) {
  const signer = await getElementSigner();
  const marketplaceContract = getMarketplaceContract(signer);
  const tx = await marketplaceContract.acceptOffer(offerId);
  return tx.wait();
}

/**
 * Cancel an offer as buyer
 */
export async function cancelOfferOnListing(offerId) {
  const signer = await getElementSigner();
  const marketplaceContract = getMarketplaceContract(signer);
  const tx = await marketplaceContract.cancelOffer(offerId);
  return tx.wait();
}
