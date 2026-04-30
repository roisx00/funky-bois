// Standalone Tasks page — used to live as a tab on the dashboard, but
// the dashboard is now a single-purpose at-a-glance view. Tasks have
// real workflow (open, verify, claim) so they get their own route.
//
// Reuses the existing TasksTab component from CollectionPage; wraps it
// in a page header that matches the rest of the site's editorial style.
import { TasksTab } from './CollectionPage';

export default function TasksPage() {
  return (
    <div className="page" style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 24px 80px' }}>
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 24,
        flexWrap: 'wrap',
        paddingBottom: 18,
        marginBottom: 28,
        borderBottom: '1px solid var(--hairline)',
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11, letterSpacing: '0.22em',
            color: 'var(--text-4)',
            marginBottom: 8,
          }}>
            <span style={{
              display: 'inline-block', width: 8, height: 8,
              background: 'var(--accent)',
              border: '1px solid var(--ink)',
              borderRadius: '50%', marginRight: 10, verticalAlign: 'middle',
            }} />
            LIVE TASKS · EARN BUSTS
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontSize: 'clamp(56px, 8vw, 88px)',
            letterSpacing: '-2px',
            lineHeight: 0.95,
            margin: 0,
            color: 'var(--ink)',
          }}>
            Show up, <em>get paid.</em>
          </h1>
          <p style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontSize: 18,
            color: 'var(--text-3)',
            margin: '14px 0 0',
            maxWidth: 620,
          }}>
            Every task verifies on-X engagement. Reply, retweet, like, follow. Each one credits your BUSTS balance the moment it's confirmed.
          </p>
        </div>
      </div>

      <TasksTab />
    </div>
  );
}
