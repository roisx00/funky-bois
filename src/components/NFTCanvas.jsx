import { buildNFTSVG } from '../data/elements';

// elements: { background: 0, hair: 1, eyes: 2, glasses: 3, outfit: 0, accessories: 1, stickers: 2 }
// Missing types are rendered as "empty slot" (no layer for that type).
export default function NFTCanvas({ elements = {}, size = 300 }) {
  const svgString = buildNFTSVG(elements);
  const scale = size / 300;
  const height = Math.round(380 * scale);

  return (
    <div
      className="nft-canvas-wrap"
      style={{ width: '100%', maxWidth: size, height: 'auto', aspectRatio: '300/380' }}
      dangerouslySetInnerHTML={{ __html: svgString }}
    />
  );
}
