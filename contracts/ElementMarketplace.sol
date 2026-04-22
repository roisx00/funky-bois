// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ElementMarketplace
 * @notice Handles buying/selling of ERC-1155 element tokens
 */
contract ElementMarketplace is ReentrancyGuard, Ownable {
    IERC1155 public elementContract;
    
    struct Listing {
        uint256 id;
        address seller;
        uint256 tokenId;
        uint256 quantity;
        uint256 pricePerToken; // in wei
        bool active;
        uint256 createdAt;
    }
    
    struct Offer {
        uint256 id;
        address offerer;
        uint256 listingId;
        uint256 offerAmount; // in wei
        bool accepted;
        uint256 createdAt;
    }
    
    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Offer) public offers;
    uint256 public listingCounter;
    uint256 public offerCounter;
    
    uint256 public platformFeePercent = 2; // 2% fee
    address public feeRecipient;
    
    event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 tokenId, uint256 quantity, uint256 pricePerToken);
    event ListingCanceled(uint256 indexed listingId, address indexed seller);
    event TokensPurchased(uint256 indexed listingId, address indexed buyer, address indexed seller, uint256 quantity, uint256 totalPrice);
    event OfferMade(uint256 indexed offerId, uint256 indexed listingId, address indexed offerer, uint256 offerAmount);
    event OfferAccepted(uint256 indexed offerId, address indexed offerer, address indexed seller);
    event OfferCanceled(uint256 indexed offerId, address indexed offerer);
    
    constructor(address _elementContract, address _feeRecipient) {
        elementContract = IERC1155(_elementContract);
        feeRecipient = _feeRecipient;
    }
    
    /**
     * @notice List tokens for sale
     */
    function createListing(uint256 _tokenId, uint256 _quantity, uint256 _pricePerToken) external {
        require(_quantity > 0, "Quantity must be > 0");
        require(_pricePerToken > 0, "Price must be > 0");
        
        uint256 listingId = listingCounter++;
        listings[listingId] = Listing({
            id: listingId,
            seller: msg.sender,
            tokenId: _tokenId,
            quantity: _quantity,
            pricePerToken: _pricePerToken,
            active: true,
            createdAt: block.timestamp
        });
        
        emit ListingCreated(listingId, msg.sender, _tokenId, _quantity, _pricePerToken);
    }
    
    /**
     * @notice Cancel a listing
     */
    function cancelListing(uint256 _listingId) external {
        Listing storage listing = listings[_listingId];
        require(listing.active, "Listing not active");
        require(listing.seller == msg.sender, "Not the seller");
        
        listing.active = false;
        emit ListingCanceled(_listingId, msg.sender);
    }
    
    /**
     * @notice Buy tokens from a listing
     */
    function buyTokens(uint256 _listingId, uint256 _quantity) external payable nonReentrant {
        Listing storage listing = listings[_listingId];
        require(listing.active, "Listing not active");
        require(_quantity > 0 && _quantity <= listing.quantity, "Invalid quantity");
        
        uint256 totalPrice = _quantity * listing.pricePerToken;
        require(msg.value >= totalPrice, "Insufficient payment");
        
        // Calculate fee
        uint256 fee = (totalPrice * platformFeePercent) / 100;
        uint256 sellerAmount = totalPrice - fee;
        
        // Update listing
        listing.quantity -= _quantity;
        if (listing.quantity == 0) {
            listing.active = false;
        }
        
        // Transfer tokens from seller to buyer
        elementContract.safeTransferFrom(
            listing.seller,
            msg.sender,
            listing.tokenId,
            _quantity,
            ""
        );
        
        // Send payment to seller
        (bool success, ) = payable(listing.seller).call{value: sellerAmount}("");
        require(success, "Payment to seller failed");
        
        // Send fee to platform
        if (fee > 0) {
            (bool feeSuccess, ) = payable(feeRecipient).call{value: fee}("");
            require(feeSuccess, "Fee transfer failed");
        }
        
        // Refund excess payment
        if (msg.value > totalPrice) {
            (bool refundSuccess, ) = payable(msg.sender).call{value: msg.value - totalPrice}("");
            require(refundSuccess, "Refund failed");
        }
        
        emit TokensPurchased(_listingId, msg.sender, listing.seller, _quantity, totalPrice);
    }
    
    /**
     * @notice Make an offer on a listing
     */
    function makeOffer(uint256 _listingId) external payable {
        Listing storage listing = listings[_listingId];
        require(listing.active, "Listing not active");
        require(msg.sender != listing.seller, "Cannot offer on own listing");
        require(msg.value > 0, "Offer must be > 0");
        
        uint256 offerId = offerCounter++;
        offers[offerId] = Offer({
            id: offerId,
            offerer: msg.sender,
            listingId: _listingId,
            offerAmount: msg.value,
            accepted: false,
            createdAt: block.timestamp
        });
        
        emit OfferMade(offerId, _listingId, msg.sender, msg.value);
    }
    
    /**
     * @notice Accept an offer on listing
     */
    function acceptOffer(uint256 _offerId) external nonReentrant {
        Offer storage offer = offers[_offerId];
        require(!offer.accepted, "Offer already accepted");
        
        Listing storage listing = listings[offer.listingId];
        require(listing.active, "Listing not active");
        require(listing.seller == msg.sender, "Not the seller");
        
        address offerer = offer.offerer;
        uint256 offerAmount = offer.offerAmount;
        
        // Mark as accepted
        offer.accepted = true;
        listing.active = false;
        
        // Calculate fee
        uint256 fee = (offerAmount * platformFeePercent) / 100;
        uint256 sellerAmount = offerAmount - fee;
        
        // Transfer token to offerer (transfer all remaining quantity)
        elementContract.safeTransferFrom(
            msg.sender,
            offerer,
            listing.tokenId,
            listing.quantity,
            ""
        );
        
        // Send payment to seller
        (bool success, ) = payable(msg.sender).call{value: sellerAmount}("");
        require(success, "Payment failed");
        
        // Send fee
        if (fee > 0) {
            (bool feeSuccess, ) = payable(feeRecipient).call{value: fee}("");
            require(feeSuccess, "Fee transfer failed");
        }
        
        emit OfferAccepted(_offerId, offerer, msg.sender);
    }
    
    /**
     * @notice Cancel an offer
     */
    function cancelOffer(uint256 _offerId) external nonReentrant {
        Offer storage offer = offers[_offerId];
        require(!offer.accepted, "Offer already accepted");
        require(offer.offerer == msg.sender, "Not the offerer");
        
        uint256 refundAmount = offer.offerAmount;
        offer.offerAmount = 0; // Mark as refunded
        
        (bool success, ) = payable(msg.sender).call{value: refundAmount}("");
        require(success, "Refund failed");
        
        emit OfferCanceled(_offerId, msg.sender);
    }
    
    /**
     * @notice Get listing details
     */
    function getListing(uint256 _listingId) external view returns (Listing memory) {
        return listings[_listingId];
    }
    
    /**
     * @notice Get offer details
     */
    function getOffer(uint256 _offerId) external view returns (Offer memory) {
        return offers[_offerId];
    }
    
    /**
     * @notice Set platform fee
     */
    function setPlatformFee(uint256 _feePercent) external onlyOwner {
        require(_feePercent <= 10, "Fee too high");
        platformFeePercent = _feePercent;
    }
    
    /**
     * @notice Set fee recipient
     */
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        feeRecipient = _feeRecipient;
    }
    
    /**
     * @notice Required for ERC1155 token transfers
     */
    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes memory
    ) public pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }
    
    /**
     * @notice Required for ERC1155 batch token transfers
     */
    function onERC1155BatchReceived(
        address,
        address,
        uint256[] memory,
        uint256[] memory,
        bytes memory
    ) public pure returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }
}
