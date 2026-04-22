export default function Skeleton({ width = '100%', height = 14, style }) {
  return (
    <span
      className="skeleton"
      style={{
        display: 'inline-block',
        width,
        height,
        background: 'linear-gradient(90deg, var(--paper-2) 0%, var(--paper-3) 50%, var(--paper-2) 100%)',
        backgroundSize: '200% 100%',
        animation: 'skeletonShimmer 1.4s ease-in-out infinite',
        borderRadius: 2,
        verticalAlign: 'middle',
        ...style,
      }}
    />
  );
}
