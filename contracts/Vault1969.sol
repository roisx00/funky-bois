// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
 * THE 1969 / On-chain Portrait Vault
 *
 * A trustless ERC-721 staking contract for the 1969 collection. Holders
 * deposit their on-chain portraits here and accrue BUSTS rewards via
 * the off-chain ledger (server reads on-chain state, computes yield,
 * credits balances).
 *
 * Design notes:
 *   - No reward token logic on-chain. BUSTS is off-chain until launch.
 *     The server is the authoritative source for yield computation and
 *     pays out via the existing busts_ledger table.
 *   - No admin functions. No pause. No upgrade path. The contract is
 *     deployed with no owner so users' NFTs cannot be frozen.
 *   - Withdraws are anytime, no penalty, no minimum stake. Accrued
 *     yield is still claimable from the dashboard after withdraw.
 *   - Each Deposit / Withdraw event is indexed by a backend worker
 *     into vault_deposits_onchain.
 *
 * Audit status: PENDING peer review + Slither pass before mainnet.
 */

interface IERC721 {
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function ownerOf(uint256 tokenId) external view returns (address);
}

abstract contract ERC721Holder {
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        // 0x150b7a02 = bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"))
        return 0x150b7a02;
    }
}

abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status = _NOT_ENTERED;

    modifier nonReentrant() {
        require(_status != _ENTERED, "REENTRANT");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}

contract Vault1969 is ERC721Holder, ReentrancyGuard {
    /// @notice The 1969 NFT contract. Set once at deploy, never changes.
    IERC721 public immutable nft;

    /// @notice tokenId -> address that deposited it. address(0) = not staked.
    mapping(uint256 => address) public depositor;

    /// @notice tokenId -> unix timestamp of the deposit. 0 = not staked.
    mapping(uint256 => uint64) public depositedAt;

    /// @notice running count of NFTs each address currently has staked.
    mapping(address => uint256) public depositCountOf;

    /// @notice total NFTs currently held by this contract.
    uint256 public totalDeposited;

    event Deposit(address indexed user, uint256 indexed tokenId, uint64 timestamp);
    event Withdraw(address indexed user, uint256 indexed tokenId, uint64 timestamp);

    error NotDepositor();
    error NotStaked();
    error AlreadyStaked();
    error EmptyBatch();

    constructor(address nftAddress) {
        require(nftAddress != address(0), "ZERO_ADDR");
        nft = IERC721(nftAddress);
    }

    /**
     * Deposit one or more 1969 portraits into the vault.
     *
     * Caller must:
     *   1. Own each tokenId (verified by safeTransferFrom).
     *   2. Have approved this contract via the 1969 contract's
     *      approve() or setApprovalForAll() before calling.
     *
     * Each token's deposit timestamp is recorded for off-chain yield
     * computation. Re-depositing a token after withdraw is allowed —
     * only the most recent deposit timestamp matters.
     */
    function deposit(uint256[] calldata tokenIds) external nonReentrant {
        uint256 n = tokenIds.length;
        if (n == 0) revert EmptyBatch();

        uint64 ts = uint64(block.timestamp);

        for (uint256 i = 0; i < n; ) {
            uint256 id = tokenIds[i];
            if (depositor[id] != address(0)) revert AlreadyStaked();
            depositor[id] = msg.sender;
            depositedAt[id] = ts;
            // safeTransferFrom triggers onERC721Received above; reverts if
            // sender doesn't own the token or hasn't approved this contract.
            nft.safeTransferFrom(msg.sender, address(this), id);
            emit Deposit(msg.sender, id, ts);
            unchecked { ++i; }
        }

        depositCountOf[msg.sender] += n;
        totalDeposited += n;
    }

    /**
     * Withdraw one or more staked portraits back to their depositor.
     * Anytime, no penalty. Off-chain yield is settled separately via the
     * dashboard's CLAIM action — withdrawing here doesn't forfeit it.
     */
    function withdraw(uint256[] calldata tokenIds) external nonReentrant {
        uint256 n = tokenIds.length;
        if (n == 0) revert EmptyBatch();

        for (uint256 i = 0; i < n; ) {
            uint256 id = tokenIds[i];
            address d = depositor[id];
            if (d == address(0)) revert NotStaked();
            if (d != msg.sender) revert NotDepositor();
            delete depositor[id];
            delete depositedAt[id];
            nft.safeTransferFrom(address(this), msg.sender, id);
            emit Withdraw(msg.sender, id, uint64(block.timestamp));
            unchecked { ++i; }
        }

        depositCountOf[msg.sender] -= n;
        totalDeposited -= n;
    }

    /// @notice convenience read for the dashboard.
    function isStaked(uint256 tokenId) external view returns (bool) {
        return depositor[tokenId] != address(0);
    }

    /**
     * Returns true if `user` is the current depositor of `tokenId`.
     * Useful for UI gating before showing a withdraw action.
     */
    function isDepositor(uint256 tokenId, address user) external view returns (bool) {
        return depositor[tokenId] == user;
    }
}
