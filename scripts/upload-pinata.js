#!/usr/bin/env node
/**
 * Upload metadata to Pinata IPFS
 */

import 'dotenv/config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const metadataDir = path.join(__dirname, '../metadata');

const apiKey = process.env.PINATA_API_KEY;
const secretKey = process.env.PINATA_SECRET_KEY;

console.log('════════════════════════════════════════════════════════════');
console.log('  📤 Pinata IPFS Upload');
console.log('════════════════════════════════════════════════════════════\n');

if (!apiKey || !secretKey) {
  console.log('❌ Pinata API keys not found in .env');
  console.log('\n📋 Add these to .env:');
  console.log('   PINATA_API_KEY=your_api_key');
  console.log('   PINATA_SECRET_KEY=your_secret_key');
  process.exit(1);
}

console.log(`✓ API Key found: ${apiKey.substring(0, 8)}...`);
console.log(`✓ Secret Key found: ${secretKey.substring(0, 8)}...\n`);

// Get all metadata files
const files = fs.readdirSync(metadataDir).filter(f => f.endsWith('.json'));
console.log(`📂 Found ${files.length} metadata files\n`);

async function uploadToPinata() {
  try {
    // Import FormData properly
    const FormData = (await import('form-data')).default;
    const fetch = (await import('node-fetch')).default;
    
    const form = new FormData();
    
    console.log('📦 Adding files to upload...');
    
    // Add each file
    for (const file of files) {
      const filepath = path.join(metadataDir, file);
      form.append('file', fs.createReadStream(filepath), file);
      
      if ((files.indexOf(file) + 1) % 30 === 0) {
        console.log(`   ✓ Added ${files.indexOf(file) + 1}/${files.length} files`);
      }
    }
    
    console.log(`   ✓ Added all ${files.length} files\n`);
    
    // Add metadata
    form.append('pinataMetadata', JSON.stringify({
      name: 'Funky Bois Element Metadata',
      keyvalues: {
        type: 'ERC-1155-Metadata',
        collection: 'FunkyBois',
        tokenCount: '147',
      },
    }));
    
    form.append('pinataOptions', JSON.stringify({
      cidVersion: 1,
    }));
    
    console.log('⬆️  Uploading to Pinata...\n');
    
    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        'pinata_api_key': apiKey,
        'pinata_secret_api_key': secretKey,
      },
      body: form,
    });
    
    const responseText = await response.text();
    
    if (!response.ok) {
      console.error('❌ API Error:', response.status, response.statusText);
      console.error('Response:', responseText);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = JSON.parse(responseText);
    
    if (!data.IpfsHash) {
      console.error('❌ No IPFS hash in response:', data);
      throw new Error('No IPFS hash returned');
    }
    
    const ipfsHash = data.IpfsHash;
    
    console.log('✅ Upload successful!\n');
    console.log('════════════════════════════════════════════════════════════');
    console.log(`  IPFS Hash: ${ipfsHash}`);
    console.log('════════════════════════════════════════════════════════════\n');
    
    console.log('📋 Update .env with:\n');
    console.log(`   ELEMENT_CONTRACT_URI=ipfs://${ipfsHash}/{{id}}.json\n`);
    
    console.log('🔗 Verify at:\n');
    console.log(`   https://gateway.pinata.cloud/ipfs/${ipfsHash}/1.json\n`);
    
    return ipfsHash;
    
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    if (error.message.includes('403')) {
      console.log('\n💡 Troubleshooting 403 Forbidden:');
      console.log('   - Check your API keys at https://pinata.cloud/admin/api-keys');
      console.log('   - Ensure the key has "Write" permissions on Files');
      console.log('   - Verify you haven\'t exceeded free tier limits');
    }
    process.exit(1);
  }
}

uploadToPinata();

