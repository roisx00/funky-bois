// Minimal ABIs + helpers for the on-chain portrait vault flow.
// All functions are pure / read-only utilities; the actual writes go
// through wagmi's useWriteContract hook in the consuming component.

// 1969 ERC-721 mainnet collection — set via project memory.
export const NFT_CONTRACT_ADDRESS = '0x890db94d920bbf44862005329d7236cc7067efab';

// ── Vault1969.sol minimal ABI (matches contracts/Vault1969.sol) ──
export const VAULT_ABI = [
  {
    type: 'function', stateMutability: 'nonpayable', name: 'deposit',
    inputs: [{ name: 'tokenIds', type: 'uint256[]' }], outputs: [],
  },
  {
    type: 'function', stateMutability: 'nonpayable', name: 'withdraw',
    inputs: [{ name: 'tokenIds', type: 'uint256[]' }], outputs: [],
  },
  {
    type: 'function', stateMutability: 'view', name: 'depositor',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function', stateMutability: 'view', name: 'depositedAt',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint64' }],
  },
  {
    type: 'function', stateMutability: 'view', name: 'totalDeposited',
    inputs: [], outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'event', name: 'Deposit', anonymous: false,
    inputs: [
      { indexed: true,  name: 'user',      type: 'address' },
      { indexed: true,  name: 'tokenId',   type: 'uint256' },
      { indexed: false, name: 'timestamp', type: 'uint64'  },
    ],
  },
  {
    type: 'event', name: 'Withdraw', anonymous: false,
    inputs: [
      { indexed: true,  name: 'user',      type: 'address' },
      { indexed: true,  name: 'tokenId',   type: 'uint256' },
      { indexed: false, name: 'timestamp', type: 'uint64'  },
    ],
  },
];

// ── ERC-721 minimal ABI (just what the deposit flow needs) ──
export const ERC721_ABI = [
  {
    type: 'function', stateMutability: 'view', name: 'balanceOf',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', stateMutability: 'view', name: 'tokenOfOwnerByIndex',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'index', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', stateMutability: 'view', name: 'isApprovedForAll',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'operator', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function', stateMutability: 'nonpayable', name: 'setApprovalForAll',
    inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }],
    outputs: [],
  },
  {
    type: 'function', stateMutability: 'view', name: 'tokenURI',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
  },
];

// Rarity multipliers (mirror docs/vault-v2-spec.md)
export const RARITY_WEIGHTS = {
  common: 1,
  rare: 3,
  legendary: 8,
  ultra_rare: 25,
};

export const RARITY_LABELS = {
  common: 'COMMON',
  rare: 'RARE',
  legendary: 'LEGENDARY',
  ultra_rare: 'ULTRA RARE',
};

// Lime accent intensity per tier — cosmetic for the deposit chip.
export const RARITY_TINT = {
  common:     'var(--paper-2)',
  rare:       'var(--paper)',
  legendary:  '#FFD43A',
  ultra_rare: 'var(--accent)',
};
