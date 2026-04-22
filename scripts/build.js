import { build } from 'esbuild';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env') });

const distPath = path.resolve(process.cwd(), 'dist');
const assetsPath = path.join(distPath, 'assets');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries(action, { retries = 5, delayMs = 150 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (error?.code !== 'EPERM' || attempt === retries) {
        throw error;
      }
      await sleep(delayMs * (attempt + 1));
    }
  }
  throw lastError;
}

async function copyFileIfChanged(sourcePath, destinationPath) {
  const sourceContent = await fs.promises.readFile(sourcePath);

  try {
    const currentContent = await fs.promises.readFile(destinationPath);
    if (currentContent.equals(sourceContent)) {
      return;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  try {
    await withRetries(() => fs.promises.writeFile(destinationPath, sourceContent));
  } catch (error) {
    if (error?.code === 'EPERM' && fs.existsSync(destinationPath)) {
      console.warn(`Build warning: could not update locked file ${destinationPath}; keeping existing copy.`);
      return;
    }
    throw error;
  }
}

async function copyDirectoryContents(sourceDir, destinationDir) {
  await fs.promises.mkdir(destinationDir, { recursive: true });
  const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryContents(sourcePath, destinationPath);
      continue;
    }

    await copyFileIfChanged(sourcePath, destinationPath);
  }
}

const defineEnv = {
  'process.env.NODE_ENV': '"production"',
  'process.env.ELEMENT_CONTRACT_ADDRESS': JSON.stringify(process.env.ELEMENT_CONTRACT_ADDRESS || process.env.VITE_ELEMENT_CONTRACT_ADDRESS || ''),
  'process.env.VITE_ELEMENT_CONTRACT_ADDRESS': JSON.stringify(process.env.VITE_ELEMENT_CONTRACT_ADDRESS || process.env.ELEMENT_CONTRACT_ADDRESS || ''),
  'process.env.MARKETPLACE_CONTRACT_ADDRESS': JSON.stringify(process.env.MARKETPLACE_CONTRACT_ADDRESS || process.env.VITE_MARKETPLACE_CONTRACT_ADDRESS || ''),
  'process.env.VITE_MARKETPLACE_CONTRACT_ADDRESS': JSON.stringify(process.env.VITE_MARKETPLACE_CONTRACT_ADDRESS || process.env.MARKETPLACE_CONTRACT_ADDRESS || ''),
  'process.env.SEPOLIA_RPC': JSON.stringify(process.env.SEPOLIA_RPC || process.env.VITE_SEPOLIA_RPC || ''),
  'process.env.VITE_SEPOLIA_RPC': JSON.stringify(process.env.VITE_SEPOLIA_RPC || process.env.SEPOLIA_RPC || ''),
  'process.env.X_CLIENT_ID': JSON.stringify(process.env.X_CLIENT_ID || process.env.VITE_X_CLIENT_ID || ''),
  'process.env.VITE_X_CLIENT_ID': JSON.stringify(process.env.VITE_X_CLIENT_ID || process.env.X_CLIENT_ID || ''),
};

async function copyStaticFiles() {
  await fs.promises.mkdir(distPath, { recursive: true });
  await fs.promises.mkdir(assetsPath, { recursive: true });

  const indexHtml = path.resolve(process.cwd(), 'index.html');
  const rawIndexHtml = await fs.promises.readFile(indexHtml, 'utf8');
  const indexWithStyles = rawIndexHtml.includes('/assets/main.css')
    ? rawIndexHtml
    : rawIndexHtml.replace('</head>', '    <link rel="stylesheet" href="/assets/main.css" />\n  </head>');
  await withRetries(() => fs.promises.writeFile(path.join(distPath, 'index.html'), indexWithStyles, 'utf8'));

  const publicDir = path.resolve(process.cwd(), 'public');
  if (fs.existsSync(publicDir)) {
    await copyDirectoryContents(publicDir, distPath);
  }
}

async function buildApp() {
  await copyStaticFiles();

  await build({
    entryPoints: ['src/main.jsx'],
    bundle: true,
    outdir: assetsPath,
    jsx: 'automatic',
    loader: {
      '.js': 'jsx',
      '.jsx': 'jsx',
      '.css': 'css',
      '.woff':  'file',
      '.woff2': 'file',
      '.ttf':   'file',
      '.eot':   'file',
    },
    define: {
      ...defineEnv,
      // wagmi/rainbowkit polyfills
      'process.env': '{}',
      'global': 'globalThis',
    },
    // Optional wallet SDKs are dynamically imported by wagmi connectors.
    // We only use RainbowKit's curated connectors, so mark the rest external.
    external: [
      '@base-org/account',
      '@coinbase/wallet-sdk',
      '@metamask/connect-evm',
      '@metamask/sdk',
      '@walletconnect/ethereum-provider',
      '@walletconnect/modal',
      'porto',
      'porto/internal',
      '@safe-global/safe-apps-provider',
      '@safe-global/safe-apps-sdk',
    ],
    minify: true,
    sourcemap: false,
    target: ['es2020'],
    format: 'esm',
    publicPath: '/assets',
    logLevel: 'info',
  });

  console.log('Build complete: dist/');
}

buildApp().catch((error) => {
  console.error(error);
  process.exit(1);
});
