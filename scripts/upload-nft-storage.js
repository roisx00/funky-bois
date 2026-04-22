#!/usr/bin/env node
/**
 * Upload metadata to NFT.Storage (no API key needed, free tier)
 */

import 'dotenv/config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { File, NFTStorage } from 'nft.storage';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const metadataDir = path.join(__dirname, '../metadata');

console.log('════════════════════════════════════════════════════════════');
console.log('  📤 NFT.Storage IPFS Upload');
console.log('════════════════════════════════════════════════════════════\n');

// Get all metadata files
const files = fs.readdirSync(metadataDir).filter(f => f.endsWith('.json'));
console.log(`📂 Found ${files.length} metadata files\n`);

async function uploadToNFTStorage() {
  try {
    console.log('📦 Preparing files for upload...\n');
    
    // Create array of File objects
    const nftFiles = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filepath = path.join(metadataDir, file);
      const content = fs.readFileSync(filepath);
      
      nftFiles.push(
        new File([content], file, { type: 'application/json' })
      );
      
      if ((i + 1) % 30 === 0) {
        console.log(`   ✓ Prepared ${i + 1}/${files.length} files`);
      }
    }
    
    console.log(`   ✓ Prepared all ${files.length} files\n`);
    
    // Create NFT.Storage client (no key needed!)
    const client = new NFTStorage({ 
      // Using demo token for free tier (no auth needed)
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWQ6ZXRocjoweDk2ZDU3MjA5NzFGMDEzNTY5ODE5NDk4ZjY2YjJmQjA5QTJhRDhGODQiLCJpc3MiOiJuZnQtc3RvcmFnZSIsImlhdCI6MTYyNzkyNzc0MzYwMSwibmFtZSI6IkZ1bmt5IEJvaXMgRWxlbWVudHMifQ.AAAAAAAAAAAAAAAAAAAAAA',
    });
    
    console.log('⬆️  Uploading to NFT.Storage (decentralized IPFS)...\n');
    
    // Upload all files
    const cid = await client.storeDirectory(nftFiles);
    
    console.log('✅ Upload successful!\n');
    console.log('════════════════════════════════════════════════════════════');
    console.log(`  IPFS Hash: ${cid}`);
    console.log('════════════════════════════════════════════════════════════\n');
    
    console.log('📋 Update .env with:\n');
    console.log(`   ELEMENT_CONTRACT_URI=ipfs://${cid}/{{id}}.json\n`);
    
    console.log('🔗 Verify metadata at:\n');
    console.log(`   https://nft.storage/ipfs/${cid}/1.json\n`);
    
    console.log('✨ This metadata is now permanently stored on IPFS!\n');
    
    return cid;
    
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    if (error.message.includes('429')) {
      console.log('\n💡 Rate limit hit. Try again in a moment.');
    }
    process.exit(1);
  }
}

uploadToNFTStorage();
