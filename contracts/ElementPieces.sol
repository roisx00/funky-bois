// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import '@openzeppelin/contracts/token/ERC1155/ERC1155.sol';
import '@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

contract ElementPieces is ERC1155, Ownable, ERC1155Supply {
    string public name = 'FunkyBois Element Pieces';
    string public symbol = 'FUNKYEL';

    constructor(string memory uri_) ERC1155(uri_) {}

    function setURI(string memory newUri) external onlyOwner {
        _setURI(newUri);
    }

    function mint(address to, uint256 id, uint256 amount, bytes memory data) external onlyOwner {
        _mint(to, id, amount, data);
    }

    function mintBatch(address to, uint256[] memory ids, uint256[] memory amounts, bytes memory data) external onlyOwner {
        _mintBatch(to, ids, amounts, data);
    }

    function burn(address from, uint256 id, uint256 amount) external {
        require(from == _msgSender() || isApprovedForAll(from, _msgSender()), 'Caller is not owner nor approved');
        _burn(from, id, amount);
    }

    function uri(uint256 tokenId) public view virtual override returns (string memory) {
        return super.uri(tokenId);
    }

    function _beforeTokenTransfer(address operator, address from, address to, uint256[] memory ids, uint256[] memory amounts, bytes memory data)
        internal
        virtual
        override(ERC1155, ERC1155Supply)
    {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
    }
}
