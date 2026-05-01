// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Foundry tests for Vault1969.
//
// Run with: forge test -vv
// (No external deps — uses a minimal mock ERC-721.)

import "forge-std/Test.sol";
import "../contracts/Vault1969.sol";

contract MockERC721 {
    mapping(uint256 => address) public ownerOf;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    function mint(address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == address(0), "minted");
        ownerOf[tokenId] = to;
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == from, "not owner");
        require(
            from == msg.sender || isApprovedForAll[from][msg.sender],
            "not approved"
        );
        ownerOf[tokenId] = to;
        // ERC721 receive callback — vault returns the magic value
        if (_isContract(to)) {
            (bool ok, bytes memory ret) = to.call(
                abi.encodeWithSignature(
                    "onERC721Received(address,address,uint256,bytes)",
                    msg.sender, from, tokenId, ""
                )
            );
            require(ok && ret.length >= 32 && bytes4(ret) == 0x150b7a02, "unsafe recipient");
        }
    }

    function _isContract(address a) internal view returns (bool) {
        return a.code.length > 0;
    }
}

contract Vault1969Test is Test {
    MockERC721 public nft;
    Vault1969  public vault;
    address public alice = address(0xA11CE);
    address public bob   = address(0xB0B);

    function setUp() public {
        nft = new MockERC721();
        vault = new Vault1969(address(nft));
        nft.mint(alice, 1);
        nft.mint(alice, 2);
        nft.mint(bob,   3);
    }

    function _approveAndDeposit(address user, uint256[] memory ids) internal {
        vm.startPrank(user);
        nft.setApprovalForAll(address(vault), true);
        vault.deposit(ids);
        vm.stopPrank();
    }

    function _ids(uint256 a) internal pure returns (uint256[] memory ids) {
        ids = new uint256[](1); ids[0] = a;
    }
    function _ids(uint256 a, uint256 b) internal pure returns (uint256[] memory ids) {
        ids = new uint256[](2); ids[0] = a; ids[1] = b;
    }

    // ── Deposit ──
    function test_deposit_singleToken() public {
        _approveAndDeposit(alice, _ids(1));
        assertEq(nft.ownerOf(1), address(vault));
        assertEq(vault.depositor(1), alice);
        assertEq(vault.depositCountOf(alice), 1);
        assertEq(vault.totalDeposited(), 1);
    }

    function test_deposit_batch() public {
        _approveAndDeposit(alice, _ids(1, 2));
        assertEq(vault.depositCountOf(alice), 2);
        assertEq(vault.totalDeposited(), 2);
    }

    function test_deposit_emptyBatch_reverts() public {
        vm.startPrank(alice);
        nft.setApprovalForAll(address(vault), true);
        vm.expectRevert(Vault1969.EmptyBatch.selector);
        vault.deposit(new uint256[](0));
        vm.stopPrank();
    }

    function test_deposit_doubleDeposit_reverts() public {
        _approveAndDeposit(alice, _ids(1));
        // Cannot re-deposit a token already in the vault.
        vm.expectRevert(Vault1969.AlreadyStaked.selector);
        vm.prank(alice);
        vault.deposit(_ids(1));
    }

    function test_deposit_notOwner_reverts() public {
        vm.startPrank(bob);
        nft.setApprovalForAll(address(vault), true);
        // Bob doesn't own token 1
        vm.expectRevert();
        vault.deposit(_ids(1));
        vm.stopPrank();
    }

    // ── Withdraw ──
    function test_withdraw_returnsToken() public {
        _approveAndDeposit(alice, _ids(1));
        vm.prank(alice);
        vault.withdraw(_ids(1));
        assertEq(nft.ownerOf(1), alice);
        assertEq(vault.depositor(1), address(0));
        assertEq(vault.depositCountOf(alice), 0);
        assertEq(vault.totalDeposited(), 0);
    }

    function test_withdraw_notDepositor_reverts() public {
        _approveAndDeposit(alice, _ids(1));
        vm.expectRevert(Vault1969.NotDepositor.selector);
        vm.prank(bob);
        vault.withdraw(_ids(1));
    }

    function test_withdraw_notStaked_reverts() public {
        vm.expectRevert(Vault1969.NotStaked.selector);
        vm.prank(alice);
        vault.withdraw(_ids(99));
    }

    function test_redepositAfterWithdraw() public {
        _approveAndDeposit(alice, _ids(1));
        vm.prank(alice);
        vault.withdraw(_ids(1));
        // Re-deposit should work now.
        vm.prank(alice);
        vault.deposit(_ids(1));
        assertEq(vault.depositor(1), alice);
    }

    // ── Misc ──
    function test_constructor_zeroNftReverts() public {
        vm.expectRevert(bytes("ZERO_ADDR"));
        new Vault1969(address(0));
    }

    function test_isStaked_isDepositor() public {
        _approveAndDeposit(alice, _ids(1));
        assertTrue(vault.isStaked(1));
        assertFalse(vault.isStaked(2));
        assertTrue(vault.isDepositor(1, alice));
        assertFalse(vault.isDepositor(1, bob));
    }
}
