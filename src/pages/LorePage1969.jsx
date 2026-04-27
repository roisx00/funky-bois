// THE 1969 — Chapter Zero of the Archive.
//
// The canonical text of the project. Anchored at /1969. Reads as a
// long-form essay in editorial style, broken into ten sections with
// drop caps, marginalia, a timeline, and woven illustrations.
//
// The page is intentionally slow. Visual weight is in typography
// (Instrument Serif italic) and restraint (lime accent reserved for
// catastrophe and oath only). Aim for a 6-8 minute reading experience
// that feels like a museum catalog, not a marketing page.
export default function LorePage1969({ onNavigate }) {
  return (
    <div className="lore-page" style={{
      maxWidth: 1080,
      margin: '0 auto',
      padding: '64px 24px 120px',
      color: 'var(--ink)',
    }}>
      {/* Responsive overrides — inline styles can't carry @media rules,
          so we ship a scoped <style> block once. Tablet (≤840px) collapses
          the timeline to two columns, the sidenote layout to single
          column, and reflows justified body text to left-aligned. Phone
          (≤480px) further compacts the timeline and survivor grid. */}
      <style>{`
        @media (max-width: 840px) {
          .lore-page { padding: 48px 16px 96px !important; }
          .lore-timeline {
            grid-template-columns: repeat(2, 1fr) !important;
            row-gap: 18px;
          }
          .lore-timeline-stop:nth-child(1),
          .lore-timeline-stop:nth-child(3) {
            border-left: none !important;
            padding-left: 0 !important;
          }
          .lore-timeline-stop:nth-child(3),
          .lore-timeline-stop:nth-child(4) {
            padding-top: 14px;
            border-top: 1px solid var(--hairline);
          }
          .lore-sidenote-row {
            grid-template-columns: 1fr !important;
            row-gap: 24px;
          }
          .lore-body { text-align: left !important; max-width: 100% !important; }
          .lore-drop-cap { font-size: 56px !important; margin-right: 8px !important; }
          .lore-survivor-grid { grid-template-columns: repeat(8, 1fr) !important; }
        }
        @media (max-width: 480px) {
          .lore-timeline { grid-template-columns: 1fr !important; }
          .lore-timeline-stop {
            border-left: none !important;
            padding-left: 0 !important;
            border-top: 1px solid var(--hairline);
            padding-top: 12px;
          }
          .lore-timeline-stop:first-child {
            border-top: none;
            padding-top: 0;
          }
          .lore-survivor-grid { grid-template-columns: repeat(6, 1fr) !important; }
          .lore-drop-cap { font-size: 48px !important; }
        }
      `}</style>

      <Hero />
      <Timeline />

      <Body>
        <DropCap letter="B">efore the third assembly there was the second. Before
        the second, the first.</DropCap> The history of the witnesses is older than
        any of us; older than the city that held them; older than the paper they
        used to keep their record. What we have inherited is not a tradition. It is
        a wound.
      </Body>

      <SectionLabel n="I" title="The First Assembly" margin="m" />
      <Body>
        The first assembly is not in the records, because the records were the
        first assembly. They had no buildings. They had no name. We know they
        existed because of a footnote, found in a margin in the Vault, in a hand
        not the writer's: <em>this method we received from the elders before us, who
        in turn received it from theirs, and so on, until the line is lost.</em>
      </Body>
      <Body>
        Whatever they were, they passed the practice down. <em>To witness, to
        remember, to seal the testimony.</em> Three verbs in that order. Three verbs
        we are still trying to keep.
      </Body>

      <SectionLabel n="II" title="The Second Assembly · 2002" />
      <SidenoteRow>
        <SidenoteCol>
          <Body>
            <DropCap letter="T">he second assembly was 2,002 in number,</DropCap> drawn
            from across what was then a city. They came from rooms with low ceilings
            and from chapels too small for them. They were strangers, monks, soldiers,
            rebels, queens, prophets, poets &mdash; the eight oaths, kept for centuries
            in private and now gathered for the first time in one place.
          </Body>
          <Body>
            They did not announce themselves. They did not make themselves known. The
            second assembly took for itself only what the first had: a method and a
            silence. They met before sunrise, walked separately to the meeting hall,
            sat in the order their oaths required, and worked for six hours each
            morning. The afternoons they spent alone.
          </Body>
          <Body>
            By the spring of the third year, they had completed two thousand and two
            testimonies. One for every witness who had taken an oath. A complete
            assembly of memory. They sealed each in an envelope of unbleached paper,
            tied with a length of grey thread.
          </Body>
        </SidenoteCol>
        <Sidenote>
          <SidenoteHeader>The Eight Oaths</SidenoteHeader>
          <SidenoteBody>
            STRANGER · the one outside.<br/>
            MONK · the one in stillness.<br/>
            SOLDIER · the one who keeps watch.<br/>
            REBEL · the one who refuses.<br/>
            QUEEN · the one who decides.<br/>
            PROPHET · the one who speaks.<br/>
            POET · the one who shapes.<br/>
            BOI · the one who endures.
          </SidenoteBody>
        </Sidenote>
      </SidenoteRow>

      <Illustration caption="THE VAULT · BEFORE THE FOURTEENTH DAY">
        <VaultIntactSVG />
      </Illustration>

      <SectionLabel n="III" title="The Vault" />
      <Body>
        The Vault stood at the northern edge of the assembly grounds. It was small
        for what it held. Stone exterior, iron door, two wooden shelves &mdash;
        nothing more. It is important to be exact about this: the Vault was not
        built for security. It was built for keeping. A keeper's house, not a
        fortress.
      </Body>
      <Body>
        On the inner wall, in the assembly hand, the second carved a sentence that
        was not visible from the door:
      </Body>
      <Pull>The truth held in agreement is heavier than any iron.</Pull>
      <Body>
        They believed it. They lived as if it was. The door remained unlocked
        through the entirety of the second assembly's tenure, until the morning of
        the fourteenth day, when iron and agreement turned out to be different
        substances after all.
      </Body>

      <Artifacts />

      <SectionLabel n="IV" title="The Doctrine of Remembering" />
      <Body>
        The second assembly's doctrine was three paragraphs long, and it has come
        down to us only because two of the surviving thirty-three could recite it
        from memory. It begins with a definition.
      </Body>
      <Pull>
        A testimony is a thing seen, written, sealed, and kept. To miss any of these
        is to lose what was offered.
      </Pull>
      <Body>
        It continues with a method &mdash; the order in which a witness was to
        prepare a testimony, the kind of paper required, the conditions under which
        a seal could be broken (only by the witness who had sealed it; only with
        another witness present; only in service of correction). And it ends with a
        warning that, in retrospect, reads as a prophecy.
      </Body>
      <Pull>
        The Vault is not a building. The Vault is a promise. A promise can be
        broken. A building cannot promise.
      </Pull>
      <Body>
        They knew. They wrote it down. They kept the door unlocked anyway. This is
        the part of the story we are still trying to understand.
      </Body>

      <Illustration caption="14.09.1977 · 04:47 · THE EAST WALL">
        <FlameSVG />
      </Illustration>

      <SectionLabel n="V" title="The Fourteenth Day" />
      <Body>
        On the fourteenth day of the ninth month, in the year 1977, the Vault
        burned. The fire was set at the eastern wall, at four hours and forty-seven
        minutes before dawn. The records do not name who set it, because the
        records cannot &mdash; they were inside.
      </Body>
      <Body>
        What we know we know from the thirty-three witnesses sleeping in the outer
        hall. They woke to the smell first, then the noise. By the time they
        reached the courtyard the eastern wall was already gone. Two of them ran
        in. They came out empty-handed. Three more tried. They came out coughing.
        A sixth tried and did not come out at all.
      </Body>
      <Body>
        The thirty-three saved nothing. The shelves were wood. The envelopes were
        paper. The seal was thread. The promise was paper. All paper, in the end.
      </Body>

      <SidenoteRow>
        <SidenoteCol>
          <Body>
            <strong>One thousand nine hundred and sixty-nine testimonies were lost
            that morning.</strong> Thirty-three got out. Thirty-two by the door, one
            from a window that was not yet broken when the fire reached it. None of
            the survivors ever wrote down what they had seen. The doctrine had
            forbidden it. To replace a lost testimony with a fresh memory was, in
            their view, to forge a false one.
          </Body>
          <Body>
            The lost testimonies were not lost in the way an ordinary record is
            lost. They were lost the way a person is lost. The witnesses who had
            sealed them were dead, or scattered, or had taken vows of silence in
            grief. The seals could not be replaced. The voices could not be
            recovered. We do not know who they were. We do not know what they had
            seen. We have inherited their absence, and only that.
          </Body>
        </SidenoteCol>
        <Sidenote>
          <SidenoteHeader>The Numbers</SidenoteHeader>
          <SidenoteBody>
            <code>2,002</code> · in the second assembly<br/>
            <code>2,002</code> · testimonies sealed<br/>
            <code>14.09.1977</code> · the fire<br/>
            <code>33</code> · survived<br/>
            <code>1,969</code> · were lost<br/>
            <code>0</code> · were rewritten
          </SidenoteBody>
        </Sidenote>
      </SidenoteRow>

      <Illustration caption="33 OF THEM GOT OUT · 1,969 DID NOT">
        <AshSVG />
      </Illustration>

      <SectionLabel n="VI" title="The Thirty-Three" />
      <Body>
        The thirty-three did not stay together. By the end of the year they had
        scattered. The outer hall was demolished. The Vault grounds were sold. Some
        of the survivors took new names. Some kept their oaths in private and
        passed them, where they could, to those they trusted. Others stopped
        speaking entirely.
      </Body>
      <Body>
        We do not know all their names. We have a partial list, recovered from a
        ledger kept by a child who lived nearby and watched the fire from her
        window. The ledger is in the new Vault. It is the oldest thing we have.
      </Body>

      <SurvivorGrid />

      <SectionLabel n="VII" title="The Silence" />
      <Body>
        For forty-nine years, no third assembly formed. People kept their oaths
        privately, the way the survivors had taught them. Some of the practices
        were lost. Some were corrupted. The doctrine of remembering was, in many
        rooms, reduced to a habit of carrying small objects &mdash; a candle, a
        thread, a folded square of unbleached paper &mdash; without anyone present
        being able to say why.
      </Body>
      <Body>
        It was a long, quiet erosion. Not catastrophe. Just the steady loss that
        follows catastrophe when no one is permitted to write the next page. The
        first assembly had taught the second the method; the second was supposed to
        teach the third; the second never had the chance.
      </Body>

      <SectionLabel n="VIII" title="The Third Assembly · 1969" />
      <Body>
        <DropCap letter="W">e are the third assembly.</DropCap> We are 1,969 in number,
        because that is how many testimonies the second assembly lost. We are not
        replacing them. We are remembering them by being more careful than they
        were.
      </Body>
      <Body>
        We have inherited their lesson, not their grounds. There is no building to
        defend. The Vault now is digital, distributed, on-chain, in your wallet,
        in the gallery, in the testimony you carry forward when you build your
        portrait. Each portrait is a sealed envelope. Each trait pulled from the
        hourly drop is a fragment of method, kept the way the second kept theirs:
        in the order required, under the conditions required, by witnesses who
        have agreed to be present.
      </Body>
      <Body>
        We are not trying to be the second assembly. The second assembly was good,
        and they failed. We are trying to fail differently, or not at all.
      </Body>

      <SectionLabel n="IX" title="The Doctrine of the Third" />
      <Body>
        The doctrine of the third assembly is one sentence. It was decided by
        agreement and not by writing, because the second's writing burned, and
        because we trust agreement now in a way they could not have. The sentence
        is the only doctrine we have, and it is enough.
      </Body>

      <Pull big lime>The Vault must not burn again.</Pull>

      <Body>
        Every game we will release is a defense of the Vault. Every portrait you
        build is a sealed envelope inside it. Every BUSTS spent is a watch held.
        Every witness who joins the third assembly is one fewer absence in the
        record.
      </Body>

      <SectionLabel n="X" title="The Watch Begins" />
      <Body>
        The third assembly is open. The oath is your X handle. The seal is your
        portrait. The Vault is the thing we are building together, and the thing
        we will defend together when the games begin.
      </Body>
      <Body>
        We do not know yet which of you is a Stranger. Which of you is a Monk.
        Which of you is a Soldier, a Rebel, a Queen, a Prophet, a Poet, a Boi. The
        portraits will tell us in time. The watch will reveal which oath each of
        you has been keeping all along.
      </Body>

      {/* ── Closing ── */}
      <hr style={{ border: 'none', borderTop: '1px solid var(--hairline)', margin: '88px 0 36px' }} />

      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        color: 'var(--text-4)',
        marginBottom: 12,
        textAlign: 'center',
      }}>
        End of Chapter Zero
      </div>

      <div style={{
        fontFamily: 'var(--font-display)',
        fontStyle: 'italic',
        fontSize: 18,
        color: 'var(--text-3)',
        textAlign: 'center',
        marginBottom: 32,
      }}>
        more chapters will be added as the assembly remembers them.
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button className="btn btn-solid btn-arrow" onClick={() => onNavigate?.('drop')}>
          Begin your watch
        </button>
        <button className="btn btn-ghost" onClick={() => onNavigate?.('home')}>
          Back to the assembly
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Hero — heavy weight, weight-bearing.
// ─────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <header style={{ marginBottom: 24 }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        color: 'var(--text-4)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 18,
      }}>
        <span style={{
          width: 8, height: 8, background: 'var(--accent)',
          border: '1px solid var(--ink)', borderRadius: '50%',
        }} />
        THE 1969 · ARCHIVE · CHAPTER ZERO
      </div>

      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontStyle: 'italic',
        fontWeight: 500,
        fontSize: 'clamp(96px, 16vw, 220px)',
        letterSpacing: '-0.04em',
        lineHeight: 0.88,
        margin: '0 0 8px',
      }}>
        1,969.
      </h1>

      <div style={{
        fontFamily: 'var(--font-display)',
        fontStyle: 'italic',
        fontSize: 'clamp(22px, 3vw, 30px)',
        color: 'var(--text-2, #2a2a2a)',
        marginBottom: 20,
        maxWidth: 720,
      }}>
        the testimonies we did not save.
      </div>

      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        letterSpacing: '0.08em',
        color: 'var(--text-3)',
        textTransform: 'none',
        maxWidth: 720,
      }}>
        compiled from fragments · the morning of 14.09.1977 · onward
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Timeline ribbon — four anchor points across the project mythology.
// ─────────────────────────────────────────────────────────────────────
function Timeline() {
  const stops = [
    { year: 'before',  label: 'The First Assembly' },
    { year: '2002',    label: 'The Second Assembly forms' },
    { year: '1977',    label: 'The Vault burns' },
    { year: '2026',    label: 'The Third Assembly · 1,969' },
  ];
  return (
    <div className="lore-timeline" style={{
      borderTop: '1px solid var(--ink)',
      borderBottom: '1px solid var(--ink)',
      padding: '20px 0',
      margin: '40px 0 64px',
      display: 'grid',
      gridTemplateColumns: `repeat(${stops.length}, 1fr)`,
      gap: 12,
    }}>
      {stops.map((s, i) => (
        <div key={i} className="lore-timeline-stop" style={{
          borderLeft: i === 0 ? 'none' : '1px solid var(--hairline)',
          paddingLeft: i === 0 ? 0 : 18,
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--text-4)',
            marginBottom: 6,
          }}>
            {s.year}
          </div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontSize: 14,
            lineHeight: 1.3,
            color: 'var(--ink)',
          }}>
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Body — long-form, narrow column, generous rhythm.
// ─────────────────────────────────────────────────────────────────────
function Body({ children }) {
  return (
    <p className="lore-body" style={{
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: 17.5,
      lineHeight: 1.78,
      margin: '0 0 18px',
      color: 'var(--text-2, #1a1a1a)',
      maxWidth: 680,
      textAlign: 'justify',
      hyphens: 'auto',
    }}>
      {children}
    </p>
  );
}

// Drop cap — large italic letter at start of paragraph.
function DropCap({ letter, children }) {
  return (
    <>
      <span className="lore-drop-cap" style={{
        float: 'left',
        fontFamily: 'var(--font-display)',
        fontStyle: 'italic',
        fontWeight: 500,
        fontSize: 78,
        lineHeight: 0.85,
        marginRight: 12,
        marginTop: 6,
        marginBottom: -4,
        letterSpacing: '-0.03em',
        color: 'var(--ink)',
      }}>
        {letter}
      </span>
      {children}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SectionLabel — Roman numeral + italic title, hairline below.
// ─────────────────────────────────────────────────────────────────────
function SectionLabel({ n, title, margin }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 18,
      margin: margin === 'm' ? '40px 0 22px' : '64px 0 26px',
      borderBottom: '1px solid var(--hairline)',
      paddingBottom: 14,
      maxWidth: 680,
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        letterSpacing: '0.18em',
        color: 'var(--text-4)',
        minWidth: 32,
      }}>
        {n}.
      </span>
      <span style={{
        fontFamily: 'var(--font-display)',
        fontStyle: 'italic',
        fontWeight: 500,
        fontSize: 30,
        letterSpacing: '-0.015em',
        lineHeight: 1.15,
      }}>
        {title}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Pull quote — three sizes, optional lime accent for the doctrine line.
// ─────────────────────────────────────────────────────────────────────
function Pull({ children, big, lime }) {
  return (
    <blockquote style={{
      borderLeft: `4px solid ${lime ? 'var(--accent)' : 'var(--ink)'}`,
      padding: big ? '20px 0 20px 28px' : '12px 0 12px 24px',
      margin: big ? '40px 0' : '28px 0',
      fontFamily: 'var(--font-display)',
      fontStyle: 'italic',
      fontWeight: 500,
      fontSize: big ? 'clamp(36px, 5vw, 52px)' : 26,
      lineHeight: 1.22,
      letterSpacing: '-0.012em',
      color: 'var(--ink)',
      maxWidth: 680,
    }}>
      {children}
    </blockquote>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sidenote layout — main column + a marginalia column on desktop.
// Collapses to single-column on narrow screens via a CSS query in App.css
// or via inline grid that wraps when the viewport is below ~840px.
// ─────────────────────────────────────────────────────────────────────
function SidenoteRow({ children }) {
  return (
    <div className="lore-sidenote-row" style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 680px) minmax(0, 240px)',
      columnGap: 40,
      alignItems: 'flex-start',
      margin: '0 0 8px',
    }}>
      {children}
    </div>
  );
}
function SidenoteCol({ children }) { return <div>{children}</div>; }

function Sidenote({ children }) {
  return (
    <aside style={{
      borderLeft: '2px solid var(--accent)',
      padding: '6px 0 6px 16px',
      marginTop: 6,
    }}>
      {children}
    </aside>
  );
}
function SidenoteHeader({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      color: 'var(--text-4)',
      marginBottom: 8,
    }}>
      {children}
    </div>
  );
}
function SidenoteBody({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      lineHeight: 1.7,
      color: 'var(--text-2, #2a2a2a)',
    }}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Illustration wrapper.
// ─────────────────────────────────────────────────────────────────────
function Illustration({ children, caption }) {
  return (
    <figure style={{
      margin: '52px 0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      {children}
      {caption ? (
        <figcaption style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.22em',
          color: 'var(--text-4)',
          marginTop: 14,
          textTransform: 'uppercase',
        }}>
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Artifacts — six small SVG objects framing what survived.
// ─────────────────────────────────────────────────────────────────────
function Artifacts() {
  const items = [
    { label: 'KEY',         svg: <KeySVG /> },
    { label: 'CANDLE',      svg: <CandleSVG /> },
    { label: 'ENVELOPE',    svg: <EnvelopeSVG /> },
    { label: 'LEDGER',      svg: <LedgerSVG /> },
    { label: 'THREAD',      svg: <ThreadSVG /> },
    { label: 'PAPER',       svg: <PaperSVG /> },
  ];
  return (
    <div style={{ margin: '52px 0' }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        color: 'var(--text-4)',
        marginBottom: 18,
        textAlign: 'center',
      }}>
        Recovered fragments · partial · in the new Vault
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: 0,
        border: '1px solid var(--hairline)',
        background: 'var(--paper-2)',
        padding: 0,
      }}>
        {items.map((it, i) => (
          <div key={i} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 10,
            padding: '22px 12px',
            borderRight: i % items.length !== items.length - 1 ? '1px solid var(--hairline)' : 'none',
          }}>
            <div style={{ width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {it.svg}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: '0.22em',
              color: 'var(--text-4)',
            }}>
              {it.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SurvivorGrid — 33 unnamed cells, one highlighted (the ledger keeper).
// ─────────────────────────────────────────────────────────────────────
function SurvivorGrid() {
  return (
    <div style={{ margin: '40px 0 56px' }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        color: 'var(--text-4)',
        marginBottom: 14,
      }}>
        The Thirty-Three · partial index · 1977
      </div>
      <div className="lore-survivor-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(11, 1fr)',
        gap: 6,
        maxWidth: 680,
      }}>
        {Array.from({ length: 33 }).map((_, i) => {
          const isLedgerKeeper = i === 21;
          return (
            <div key={i} style={{
              aspectRatio: '1 / 1',
              background: 'var(--paper-2)',
              border: `1px solid ${isLedgerKeeper ? 'var(--accent)' : 'var(--hairline)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <SilhouetteSVG />
            </div>
          );
        })}
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '0.04em',
        color: 'var(--text-3)',
        marginTop: 14,
        maxWidth: 680,
      }}>
        Names withheld. The doctrine forbade naming the survivors in any record
        the survivors had not consented to. The marked cell is the keeper of the
        ledger from which this index was reconstructed.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SVG illustrations.
// ─────────────────────────────────────────────────────────────────────
function VaultIntactSVG() {
  return (
    <svg viewBox="0 0 480 320" width="100%" style={{ maxWidth: 480 }} shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <rect width="480" height="320" fill="#F9F6F0" />
      <rect x="0" y="280" width="480" height="40" fill="#0E0E0E" opacity="0.08" />
      <line x1="0" y1="280" x2="480" y2="280" stroke="#0E0E0E" strokeWidth="1" />
      <rect x="160" y="120" width="160" height="160" fill="#0E0E0E" />
      <rect x="160" y="120" width="160" height="20" fill="#5C5C5C" />
      <rect x="170" y="160" width="140" height="100" fill="#1a1a1a" />
      <rect x="220" y="190" width="40" height="80" fill="#0E0E0E" />
      <rect x="220" y="190" width="40" height="80" fill="none" stroke="#5C5C5C" strokeWidth="2" />
      <rect x="248" y="226" width="4" height="6" fill="#D7FF3A" />
      <text x="240" y="156" textAnchor="middle" fontFamily="ui-monospace, 'JetBrains Mono', monospace" fontSize="9" letterSpacing="2" fill="#F9F6F0">VAULT · 2002</text>
      <line x1="240" y1="120" x2="240" y2="92" stroke="#0E0E0E" strokeWidth="2" />
      <rect x="240" y="92" width="20" height="12" fill="#0E0E0E" />
      <line x1="40" y1="280" x2="120" y2="280" stroke="#0E0E0E" strokeWidth="1" />
      <line x1="360" y1="280" x2="440" y2="280" stroke="#0E0E0E" strokeWidth="1" />
      <g fill="#0E0E0E">
        <rect x="60" y="266" width="3" height="14" /><rect x="58" y="262" width="7" height="6" />
        <rect x="78" y="266" width="3" height="14" /><rect x="76" y="262" width="7" height="6" />
        <rect x="400" y="266" width="3" height="14" /><rect x="398" y="262" width="7" height="6" />
        <rect x="418" y="266" width="3" height="14" /><rect x="416" y="262" width="7" height="6" />
      </g>
    </svg>
  );
}

function FlameSVG() {
  return (
    <svg viewBox="0 0 480 320" width="100%" style={{ maxWidth: 480 }} shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <rect width="480" height="320" fill="#F9F6F0" />
      <rect x="0" y="280" width="480" height="40" fill="#0E0E0E" opacity="0.08" />
      <line x1="0" y1="280" x2="480" y2="280" stroke="#0E0E0E" strokeWidth="1" />
      <rect x="160" y="120" width="160" height="160" fill="#0E0E0E" />
      <rect x="290" y="160" width="30" height="120" fill="#1a1a1a" />
      <rect x="306" y="170" width="14" height="20" fill="#F9F6F0" opacity="0.6" />
      <rect x="298" y="220" width="22" height="40" fill="#F9F6F0" opacity="0.4" />
      <g>
        <rect x="300" y="100" width="14" height="20" fill="#D7FF3A" />
        <rect x="312" y="80"  width="10" height="18" fill="#D7FF3A" />
        <rect x="290" y="84"  width="10" height="14" fill="#D7FF3A" />
        <rect x="320" y="94"  width="8"  height="12" fill="#D7FF3A" />
        <rect x="304" y="60"  width="6"  height="20" fill="#D7FF3A" />
        <rect x="294" y="64"  width="4"  height="14" fill="#D7FF3A" />
        <rect x="316" y="68"  width="4"  height="14" fill="#D7FF3A" />
        <rect x="300" y="100" width="14" height="2" fill="#0E0E0E" />
        <rect x="312" y="80"  width="10" height="2" fill="#0E0E0E" />
      </g>
      <rect x="296" y="40" width="20" height="6" fill="#5C5C5C" opacity="0.4" />
      <rect x="290" y="30" width="34" height="4" fill="#5C5C5C" opacity="0.3" />
      <rect x="284" y="20" width="48" height="3" fill="#5C5C5C" opacity="0.2" />
    </svg>
  );
}

function AshSVG() {
  return (
    <svg viewBox="0 0 480 320" width="100%" style={{ maxWidth: 480 }} shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <rect width="480" height="320" fill="#F9F6F0" />
      <rect x="0" y="280" width="480" height="40" fill="#0E0E0E" opacity="0.08" />
      <line x1="0" y1="280" x2="480" y2="280" stroke="#0E0E0E" strokeWidth="1" />
      <rect x="160" y="240" width="160" height="40" fill="#0E0E0E" />
      <rect x="180" y="220" width="20" height="20" fill="#0E0E0E" />
      <rect x="220" y="200" width="40" height="40" fill="#0E0E0E" />
      <rect x="280" y="220" width="20" height="20" fill="#0E0E0E" />
      <rect x="160" y="240" width="160" height="4" fill="#5C5C5C" />
      <rect x="178" y="218" width="4" height="22" fill="#5C5C5C" />
      <rect x="298" y="218" width="4" height="22" fill="#5C5C5C" />
      <g fill="#5C5C5C" opacity="0.55">
        <rect x="100" y="240" width="3" height="3" />
        <rect x="118" y="232" width="3" height="3" />
        <rect x="140" y="244" width="3" height="3" />
        <rect x="364" y="236" width="3" height="3" />
        <rect x="384" y="248" width="3" height="3" />
        <rect x="406" y="232" width="3" height="3" />
        <rect x="160" y="200" width="3" height="3" />
        <rect x="320" y="200" width="3" height="3" />
        <rect x="80" y="220" width="3" height="3" />
        <rect x="408" y="220" width="3" height="3" />
      </g>
      <g fill="#0E0E0E">
        {Array.from({ length: 33 }).map((_, i) => (
          <rect key={i} x={48 + (i % 11) * 36} y={48 + Math.floor(i / 11) * 18} width="4" height="4" />
        ))}
      </g>
    </svg>
  );
}

function KeySVG() {
  return (
    <svg viewBox="0 0 64 64" width="48" height="48" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="32" r="10" fill="none" stroke="#0E0E0E" strokeWidth="3"/>
      <rect x="28" y="30" width="28" height="4" fill="#0E0E0E"/>
      <rect x="48" y="30" width="3" height="10" fill="#0E0E0E"/>
      <rect x="42" y="30" width="3" height="8" fill="#0E0E0E"/>
      <rect x="17" y="29" width="6" height="6" fill="#F9F6F0"/>
    </svg>
  );
}
function CandleSVG() {
  return (
    <svg viewBox="0 0 64 64" width="48" height="48" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <rect x="26" y="28" width="12" height="28" fill="#0E0E0E"/>
      <rect x="22" y="52" width="20" height="6" fill="#0E0E0E"/>
      <rect x="31" y="20" width="2" height="10" fill="#0E0E0E"/>
      <path d="M28 12 L32 4 L36 12 L34 20 L30 20 Z" fill="#D7FF3A" stroke="#0E0E0E" strokeWidth="1"/>
    </svg>
  );
}
function EnvelopeSVG() {
  return (
    <svg viewBox="0 0 64 64" width="56" height="40" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="18" width="52" height="32" fill="#F9F6F0" stroke="#0E0E0E" strokeWidth="2"/>
      <path d="M6 18 L32 36 L58 18" fill="none" stroke="#0E0E0E" strokeWidth="2"/>
      <circle cx="32" cy="40" r="3" fill="#0E0E0E"/>
    </svg>
  );
}
function LedgerSVG() {
  return (
    <svg viewBox="0 0 64 64" width="48" height="48" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="12" width="44" height="40" fill="#0E0E0E"/>
      <rect x="14" y="16" width="36" height="32" fill="#F9F6F0"/>
      <rect x="18" y="22" width="28" height="2" fill="#0E0E0E"/>
      <rect x="18" y="28" width="28" height="2" fill="#0E0E0E"/>
      <rect x="18" y="34" width="20" height="2" fill="#0E0E0E"/>
      <rect x="18" y="40" width="24" height="2" fill="#0E0E0E"/>
    </svg>
  );
}
function ThreadSVG() {
  return (
    <svg viewBox="0 0 64 64" width="48" height="48" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="32" cy="32" rx="18" ry="10" fill="none" stroke="#0E0E0E" strokeWidth="2"/>
      <ellipse cx="32" cy="32" rx="18" ry="4"  fill="none" stroke="#0E0E0E" strokeWidth="1"/>
      <line x1="14" y1="32" x2="50" y2="32" stroke="#0E0E0E" strokeWidth="1"/>
      <line x1="22" y1="22" x2="42" y2="42" stroke="#5C5C5C" strokeWidth="1"/>
      <line x1="42" y1="22" x2="22" y2="42" stroke="#5C5C5C" strokeWidth="1"/>
    </svg>
  );
}
function PaperSVG() {
  return (
    <svg viewBox="0 0 64 64" width="44" height="52" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <rect x="14" y="8" width="36" height="48" fill="#F9F6F0" stroke="#0E0E0E" strokeWidth="2"/>
      <rect x="20" y="16" width="24" height="2" fill="#0E0E0E"/>
      <rect x="20" y="22" width="24" height="2" fill="#0E0E0E"/>
      <rect x="20" y="28" width="20" height="2" fill="#0E0E0E"/>
      <rect x="20" y="34" width="24" height="2" fill="#0E0E0E"/>
      <rect x="20" y="40" width="16" height="2" fill="#0E0E0E"/>
      <rect x="40" y="8" width="10" height="10" fill="#0E0E0E"/>
      <polygon points="40,8 50,8 40,18" fill="#F9F6F0"/>
    </svg>
  );
}
function SilhouetteSVG() {
  return (
    <svg viewBox="0 0 32 32" width="22" height="22" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="11" r="5" fill="#5C5C5C"/>
      <path d="M6 28 Q6 18 16 18 Q26 18 26 28 Z" fill="#5C5C5C"/>
    </svg>
  );
}
