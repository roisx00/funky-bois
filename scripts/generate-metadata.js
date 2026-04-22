/**
 * Generates metadata JSON for all 147 ERC-1155 element tokens
 * and uploads them to Pinata (IPFS)
 * 
 * Usage: node scripts/generate-metadata.js
 */

import 'dotenv/config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import element data
import { ELEMENT_TYPES, ELEMENT_VARIANTS, ELEMENT_LABELS, getElementInfoFromTokenId } from '../src/data/elements.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create metadata directory
const metadataDir = path.join(__dirname, '../metadata');
if (!fs.existsSync(metadataDir)) {
  fs.mkdirSync(metadataDir, { recursive: true });
}

/**
 * Generate metadata for a single token
 * @param {number} tokenId - Token ID (1-147)
 * @returns {object} Metadata object
 */
function generateTokenMetadata(tokenId) {
  const info = getElementInfoFromTokenId(tokenId);
  const { type, info: variantInfo } = info;
  const displayName = variantInfo.name;
  const rarity = variantInfo.rarity;
  
  // Map rarity to numeric rarity score
  const rarityScores = {
    common: 1,
    rare: 2,
    legendary: 3,
    ultra_rare: 4,
  };

  return {
    name: `${ELEMENT_LABELS[type]} - ${displayName}`,
    description: `A ${rarity} ${ELEMENT_LABELS[type]} element piece. Collect 7 different element types to mint your unique Funky Boi character.\n\nType: ${ELEMENT_LABELS[type]}\nVariant: ${displayName}\nRarity: ${rarity}\nToken ID: ${tokenId}`,
    image: `https://raw.githubusercontent.com/yourusername/funky-bois/main/public/element-renders/${tokenId}.png`,
    external_url: `https://funky-bois.vercel.app/marketplace?token=${tokenId}`,
    attributes: [
      {
        trait_type: 'Element Type',
        value: ELEMENT_LABELS[type],
      },
      {
        trait_type: 'Variant',
        value: displayName,
      },
      {
        trait_type: 'Rarity',
        value: rarity,
      },
      {
        trait_type: 'Rarity Score',
        value: rarityScores[rarity],
      },
      {
        trait_type: 'Token ID',
        value: tokenId,
      },
      {
        trait_type: 'Element Category',
        value: type === 'background' ? 'Background' :
               type === 'hair' ? 'Hair' :
               type === 'eyes' ? 'Eyes' :
               type === 'glasses' ? 'Face' :
               type === 'outfit' ? 'Outfit' :
               type === 'accessories' ? 'Accessory' : 'Other',
      },
    ],
    properties: {
      type: type,
      variant: displayName,
      rarity: rarity,
    },
  };
}

/**
 * Generate all metadata files
 */
function generateAllMetadata() {
  console.log('🎨 Generating metadata for 147 element tokens...');
  
  const metadataFiles = {};
  
  for (let tokenId = 1; tokenId <= 147; tokenId++) {
    try {
      const metadata = generateTokenMetadata(tokenId);
      const filename = `${tokenId}.json`;
      const filepath = path.join(metadataDir, filename);
      
      // Write JSON file
      fs.writeFileSync(filepath, JSON.stringify(metadata, null, 2));
      metadataFiles[tokenId] = metadata;
      
      if (tokenId % 20 === 0) {
        console.log(`  ✓ Generated metadata for tokens 1-${tokenId}`);
      }
    } catch (error) {
      console.error(`❌ Error generating metadata for token ${tokenId}:`, error.message);
    }
  }
  
  console.log(`✅ Generated ${Object.keys(metadataFiles).length} metadata files in ${metadataDir}`);
  return metadataFiles;
}

/**
 * Upload metadata to Pinata
 */
async function uploadToPinata() {
  // Check for Pinata API key in environment
  const pinataApiKey = process.env.PINATA_API_KEY;
  const pinataSecretKey = process.env.PINATA_SECRET_KEY;
  
  if (!pinataApiKey || !pinataSecretKey) {
    console.log('\n⚠️  Pinata API keys not found in .env');
    console.log('   To upload to IPFS:');
    console.log('   1. Create account at https://pinata.cloud');
    console.log('   2. Generate API keys (Admin > API Keys)');
    console.log('   3. Add to .env:');
    console.log('      PINATA_API_KEY=your_api_key');
    console.log('      PINATA_SECRET_KEY=your_secret_key');
    console.log('\n📂 Metadata files ready at:', metadataDir);
    return null;
  }
  
  console.log('\n📤 Uploading to Pinata...');
  
  try {
    const FormData = (await import('form-data')).default;
    const fetch = (await import('node-fetch')).default;
    
    const form = new FormData();
    
    // Add each metadata file
    for (let tokenId = 1; tokenId <= 147; tokenId++) {
      const filepath = path.join(metadataDir, `${tokenId}.json`);
      const fileStream = fs.createReadStream(filepath);
      form.append('file', fileStream, `${tokenId}.json`);
    }
    
    // Add metadata
    form.append('pinataMetadata', JSON.stringify({
      name: 'Funky Bois Element Metadata',
      keyvalues: {
        type: 'ERC-1155-Metadata',
        collection: 'FunkyBois',
        tokenCount: '147',
      },
    }));
    
    // Upload to Pinata
    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        'pinata_api_key': pinataApiKey,
        'pinata_secret_api_key': pinataSecretKey,
      },
      body: form,
    });
    
    if (!response.ok) {
      throw new Error(`Pinata API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const ipfsHash = data.IpfsHash;
    
    console.log('✅ Uploaded to IPFS!');
    console.log('   IPFS Hash:', ipfsHash);
    console.log('   Metadata URI: ipfs://' + ipfsHash + '/{id}.json');
    console.log('   Gateway URL: https://gateway.pinata.cloud/ipfs/' + ipfsHash + '/{id}.json');
    
    return ipfsHash;
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    return null;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  🎨 Funky Bois Element Metadata Generator');
  console.log('════════════════════════════════════════════════════════════\n');
  
  // Generate metadata files
  generateAllMetadata();
  
  // Try to upload to Pinata
  const ipfsHash = await uploadToPinata();
  
  if (ipfsHash) {
    console.log('\n📋 Next steps:');
    console.log('   1. Update .env with IPFS hash:');
    console.log(`      ELEMENT_CONTRACT_URI=ipfs://${ipfsHash}/{{id}}.json`);
    console.log('   2. Update ElementPieces contract URI');
    console.log('   3. Deploy marketplace to production');
  }
}

main().catch(console.error);
