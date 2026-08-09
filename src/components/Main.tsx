import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth'
import { saveFcmToken, watchEvents, watchMembers, watchPlaces } from '../data'
import { TYPE_META, type BandEvent, type EventType, type Member, type Place } from '../types'
import { dayDiff, ddayLabel, longWhen, parseDate } from '../time'
import { copyValue, resolvePlace } from '../place'
import { autoRegisterPush, startForegroundNotifications } from '../messaging'
import EventCard from './EventCard'
import EventForm from './EventForm'
import { TypeGlyph } from './TypeGlyph'
import Settings from './Settings'
import PlacesView from './Places'
import Toast, { useToast } from './Toast'
import { CopyButton } from './CopyButton'
import { versionLabel } from '../version'

type Filter = 'all' | EventType

export default function Main() {
  const { member, signOutUser } = useAuth()
  const isAdmin = !!member?.admin
  const [events, setEvents] = useState<BandEvent[]>([])
  const [places, setPlaces] = useState<Place[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [nav, setNav] = useState<'home' | 'places'>('home')
  const [placesErr, setPlacesErr] = useState('')
  const [editing, setEditing] = useState<BandEvent | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const toast = useToast()

  useEffect(
    () =>
      watchEvents(setEvents, (e) => {
        const code = (e as { code?: string })?.code ?? ''
        setLoadErr(
          code === 'permission-denied'
            ? '일정을 불러올 권한이 없어요. Firestore 보안 규칙이 게시됐는지 확인해 주세요.'
            : '일정을 불러오지 못했어요.' + (code ? ` (${code})` : ''),
        )
      }),
    [],
  )
  useEffect(
    () =>
      watchPlaces(setPlaces, (e) => {
        const code = (e as { code?: string })?.code ?? ''
        setPlacesErr(
          code === 'permission-denied'
            ? '장소를 불러올 권한이 없어요. Firestore 보안 규칙을 다시 게시해 주세요.'
            : '장소를 불러오지 못했어요.' + (code ? ` (${code})` : ''),
        )
      }),
    [],
  )
  useEffect(() => watchMembers(setMembers), [])
  useEffect(() => {
    startForegroundNotifications()
  }, [])
  // 앱 시작 시 현재 배포된 버전·빌드 시각을 안내 (배포 확인용)
  useEffect(() => {
    toast.show(versionLabel())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // 기본 켜기: 로그인하면 자동으로 알림 권한 요청 + 토큰 등록 (허용된 기기는 조용히 갱신)
  useEffect(() => {
    if (!member) return
    autoRegisterPush().then((t) => {
      if (t) saveFcmToken(member.uid, t)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.uid])

  const placesMap = useMemo(() => new Map(places.map((p) => [p.id, p])), [places])

  const sorted = useMemo(
    () => [...events].sort((a, b) => (a.date + a.rehStart).localeCompare(b.date + b.rehStart)),
    [events],
  )
  const upcoming = useMemo(() => sorted.filter((e) => dayDiff(e.date) >= 0), [sorted])
  // 지난 일정: 최신순(방금 끝난 것부터)
  const past = useMemo(() => sorted.filter((e) => dayDiff(e.date) < 0).reverse(), [sorted])
  const next = upcoming[0]
  const base = tab === 'upcoming' ? upcoming : past
  const list = base.filter((e) => filter === 'all' || e.type === filter)

  const groups = useMemo(() => {
    const g: { key: string; items: BandEvent[] }[] = []
    for (const e of list) {
      const d = parseDate(e.date)
      const key = `${d.getFullYear()}년`
      const last = g[g.length - 1]
      if (last && last.key === key) last.items.push(e)
      else g.push({ key, items: [e] })
    }
    return g
  }, [list])

  function openAdd() {
    setEditing(null)
    setFormOpen(true)
  }
  function openEdit(ev: BandEvent) {
    setEditing(ev)
    setFormOpen(true)
  }

  if (settingsOpen) return <Settings onClose={() => setSettingsOpen(false)} />

  // <전체> 다음은 무지개(빨강→보라) 순: 공연(코랄) · 번개(옐로) · 합주(시안) · 회의(인디고)
  const TYPE_ORDER: EventType[] = ['show', 'flash', 'practice', 'meeting']
  const filters: { k: Filter; label: string; color: string }[] = [
    { k: 'all', label: '전체', color: 'var(--ink-faint)' },
    ...TYPE_ORDER.map((k) => ({
      k,
      label: TYPE_META[k].label,
      color: TYPE_META[k].color,
    })),
  ]

  const nextPlace = next ? resolvePlace(next, placesMap) : null

  return (
    <div className="app">
      <header className="top">
        <div className="brandrow">
          <div className="mark">
            <img src="/logo.png" alt="Amici Band" />
          </div>
          <div className="brand">
            <h1>{nav === 'places' ? '장소' : 'Amici Band'}</h1>
            <p>{nav === 'places' ? '주차·비밀번호 등 메모를 남겨두세요' : '연습 · 공연 일정'}</p>
          </div>
          <button className="ghost-btn icon" onClick={() => setSettingsOpen(true)} aria-label="설정" title="설정">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </button>
          <div className="usermenu">
            <button className="ghost-btn" onClick={() => setMenuOpen((v) => !v)}>
              {member?.name}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {menuOpen && (
              <div className="menu" onMouseLeave={() => setMenuOpen(false)}>
                <button onClick={signOutUser}>로그아웃</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {nav === 'home' ? (
      <>
      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={tab === 'upcoming'} className={tab === 'upcoming' ? 'on' : ''} onClick={() => setTab('upcoming')}>
          다가오는
        </button>
        <button role="tab" aria-selected={tab === 'past'} className={tab === 'past' ? 'on' : ''} onClick={() => setTab('past')}>
          지난 일정{past.length > 0 && <span className="seg-count">{past.length}</span>}
        </button>
      </div>

      <div className="filters">
        {filters.map((f) => (
          <button
            key={f.k}
            className="chip"
            aria-pressed={filter === f.k}
            style={{ ['--k' as string]: f.color }}
            onClick={() => setFilter(f.k)}
          >
            {f.k === 'all' ? <span className="dot" /> : <TypeGlyph type={f.k} className="type-ico" />}
            {f.label}
          </button>
        ))}
      </div>

      <main className="scroll">
        {loadErr && <div className="banner-err">{loadErr}</div>}
        {tab === 'upcoming' && (next ? (
          <div className="hero" style={{ ['--k' as string]: TYPE_META[next.type].color }}>
            <TypeGlyph type={next.type} className="wm" />
            <div className="eyebrow">다음 일정 · {TYPE_META[next.type].label}</div>
            <div className="dday">
              <b>{ddayLabel(dayDiff(next.date))}</b>
              <span>{longWhen(next)}</span>
            </div>
            <h2>{next.title}</h2>
            {nextPlace && (
              <div className="meta">
                <span className="loc-line">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                  {nextPlace.name}
                  <CopyButton text={copyValue(nextPlace)} onCopied={() => toast.show('주소가 복사되었어요')} />
                </span>
                {nextPlace.address && <span className="addr-line">{nextPlace.address}</span>}
              </div>
            )}
          </div>
        ) : (
          <div className="hero empty">
            <p>
              다가오는 일정이 없어요.
              {isAdmin && (
                <>
                  <br />
                  아래 <b>+ 일정 추가</b>로 첫 일정을 등록해 보세요.
                </>
              )}
            </p>
          </div>
        ))}

        {list.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
            <p>{tab === 'past' ? '지난 일정이 없어요.' : '표시할 일정이 없어요.'}</p>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              <div className="month-label">{g.key}</div>
              <div className="list">
                {g.items.map((ev) => (
                  <EventCard
                    key={ev.id}
                    ev={ev}
                    place={resolvePlace(ev, placesMap)}
                    members={members}
                    onEdit={() => openEdit(ev)}
                    toast={toast}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </main>

      {isAdmin && (
        <button className="fab" onClick={openAdd}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          일정 추가
        </button>
      )}
      </>
      ) : (
        <PlacesView places={places} loadErr={placesErr} toast={toast} />
      )}

      <nav className="bottom-nav" role="tablist" aria-label="주 메뉴">
        <button
          role="tab"
          aria-selected={nav === 'home'}
          className={'navitem' + (nav === 'home' ? ' on' : '')}
          onClick={() => setNav('home')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
          일정
        </button>
        <button
          role="tab"
          aria-selected={nav === 'places'}
          className={'navitem' + (nav === 'places' ? ' on' : '')}
          onClick={() => setNav('places')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
          장소
        </button>
      </nav>

      {formOpen && (
        <EventForm editing={editing} places={places} onClose={() => setFormOpen(false)} />
      )}

      <Toast state={toast} />
    </div>
  )
}
