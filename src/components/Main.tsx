import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth'
import { saveFcmToken, saveWebPushSubscription, watchEvents, watchMembers, watchPlaces } from '../data'
import { TYPE_META, type BandEvent, type EventType, type Member, type Place } from '../types'
import { dayDiff, ddayLabel, longWhen, parseDate } from '../time'
import { copyValue, resolvePlace } from '../place'
import {
  autoRegisterPush,
  isApplePwaNeedsInstall,
  isStandaloneApp,
  mobileOS,
  notificationPermission,
  pushConfigured,
  requestNotificationRegistrations,
  startForegroundNotifications,
} from '../messaging'
import EventCard from './EventCard'
import EventForm from './EventForm'
import { TypeGlyph } from './TypeGlyph'
import Settings from './Settings'
import PlacesView from './Places'
import MusicView from './Music'
import RecordingsView from './Recordings'
import ScoresView from './Scores'
import Toast, { useToast } from './Toast'
import { CopyButton } from './CopyButton'
import { versionLabel } from '../version'
import { useAndroidBack, useBackHandler } from '../backnav'

type Filter = 'all' | EventType

export default function Main() {
  const { member, signOutUser } = useAuth()
  const isAdmin = !!member?.admin
  const [events, setEvents] = useState<BandEvent[]>([])
  const [places, setPlaces] = useState<Place[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [nav, setNav] = useState<'home' | 'places' | 'music' | 'recordings' | 'scores'>('home')
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

  // ── 안드로이드 물리 뒤로가기 ──
  // 열린 다이얼로그·시트·상세는 각 컴포넌트가 useBackHandler 로 자기 닫기를 등록한다
  // (등록 시점 = 화면 열림에 히스토리 항목이 쌓인다). 사용자 메뉴·탭(음악/장소)→홈도 같은 방식.
  useBackHandler(() => setMenuOpen(false), menuOpen)
  useBackHandler(() => setNav('home'), nav !== 'home')
  useAndroidBack(() => toast.show('한 번 더 누르면 종료됩니다'))

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
            <h1>{nav === 'places' ? '장소' : nav === 'music' ? '음악' : nav === 'recordings' ? '기록' : nav === 'scores' ? '악보' : 'Amici Band'}</h1>
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

      <NotifBanner />

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
      ) : nav === 'places' ? (
        <PlacesView places={places} loadErr={placesErr} toast={toast} />
      ) : nav === 'recordings' ? (
        <RecordingsView toast={toast} />
      ) : nav === 'scores' ? (
        <ScoresView toast={toast} />
      ) : (
        <MusicView toast={toast} />
      )}

      <nav className="bottom-nav" role="tablist" aria-label="주 메뉴">
        <button
          role="tab"
          aria-selected={nav === 'music'}
          className={'navitem' + (nav === 'music' ? ' on' : '')}
          onClick={() => setNav('music')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
          음악
        </button>
        <button
          role="tab"
          aria-selected={nav === 'recordings'}
          className={'navitem' + (nav === 'recordings' ? ' on' : '')}
          onClick={() => setNav('recordings')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m10 9 5 3-5 3z" /></svg>
          기록
        </button>
        {/* 중앙 = 홈(일정): 브랜드 원형 버튼으로 한 단 띄운다 */}
        <button
          role="tab"
          aria-selected={nav === 'home'}
          className={'navitem navhome' + (nav === 'home' ? ' on' : '')}
          onClick={() => setNav('home')}
          aria-label="일정 (홈)"
        >
          <span className="navhome-badge">
            <img src="/logo.png" alt="" />
          </span>
          일정
        </button>
        <button
          role="tab"
          aria-selected={nav === 'scores'}
          className={'navitem' + (nav === 'scores' ? ' on' : '')}
          onClick={() => setNav('scores')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v4h4" /><path d="M10.5 11v6.2" /><circle cx="9" cy="17.4" r="1.7" /></svg>
          악보
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

/**
 * 알림이 꺼진 멤버에게 상단에 '알림 켜기' 배너를 노출(투표 요청 등 푸시를 받으려면 각자 켜야 함).
 * 버튼(사용자 제스처)으로 권한을 요청하므로 자동 요청보다 확실히 팝업이 뜬다.
 * 아이폰(미설치)은 홈 화면 추가 안내만 보여준다.
 */
function NotifBanner() {
  const { user } = useAuth()
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(notificationPermission())
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  if (!user || dismissed) return null
  if (perm === 'granted' || perm === 'unsupported') return null
  const iosInstall = isApplePwaNeedsInstall()
  if (!iosInstall && !pushConfigured()) return null // 알림 자체가 불가한 환경
  const denied = perm === 'denied'

  async function enable() {
    if (busy || !user) return
    setBusy(true)
    try {
      const { fcmToken, webPushSubscription } = await requestNotificationRegistrations()
      await Promise.all([
        fcmToken ? saveFcmToken(user.uid, fcmToken) : Promise.resolve(),
        webPushSubscription ? saveWebPushSubscription(user.uid, webPushSubscription) : Promise.resolve(),
      ])
    } finally {
      const p = notificationPermission()
      setPerm(p)
      if (p !== 'granted') setHelpOpen(true) // 팝업이 안 뜨면(이미 차단 등) 설정 안내를 펼친다
      setBusy(false)
    }
  }

  return (
    <div className="notif-banner">
      <div className="notif-banner-main">
        <span className="notif-banner-ico" aria-hidden="true">🔔</span>
        <span className="notif-banner-text">
          {iosInstall
            ? '아이폰은 홈 화면에 추가한 뒤 알림을 켤 수 있어요 (공유 → 홈 화면에 추가).'
            : denied
              ? '알림이 차단돼 있어요. 아래 안내대로 허용해 주세요.'
              : '알림을 켜면 새 일정·투표 요청을 바로 받아요.'}
        </span>
        {!iosInstall && (
          <button type="button" className="btn primary notif-banner-btn" onClick={() => void enable()} disabled={busy}>
            {busy ? '켜는 중…' : '알림 켜기'}
          </button>
        )}
        <button type="button" className="notif-banner-x" onClick={() => setDismissed(true)} aria-label="닫기">×</button>
      </div>
      {!iosInstall && denied && (
        <div className="notif-banner-help">
          <button type="button" className="notif-help-toggle" onClick={() => setHelpOpen((o) => !o)} aria-expanded={helpOpen}>
            {helpOpen ? '설정 방법 접기' : '설정 방법 보기'}
          </button>
          {helpOpen && <NotifHelpSteps />}
        </div>
      )}
    </div>
  )
}

/** 알림 차단 해제 방법 — iOS / 안드로이드(설치 여부) / 데스크톱에 맞춰 안내 */
function NotifHelpSteps() {
  const os = mobileOS()
  const standalone = isStandaloneApp()
  const first =
    os === 'ios' ? (
      <>
        <b>iPhone 설정 → 알림 → Amici</b> → ‘알림 허용’ 켜기
        <span className="notif-help-sub">(홈 화면에 추가된 앱에서만 알림을 받을 수 있어요)</span>
      </>
    ) : os === 'android' ? (
      standalone ? (
        <><b>기기 설정 → 앱 → Amici → 알림</b> → 켜기</>
      ) : (
        <>Chrome 주소창 왼쪽 <b>자물쇠(사이트 정보) → 권한 → 알림</b> → 허용</>
      )
    ) : (
      <>주소창 왼쪽 <b>자물쇠(사이트 정보) → 알림</b> → 허용</>
    )

  return (
    <ul className="notif-help-steps">
      <li>{first}</li>
      <li>허용한 뒤 위 <b>‘알림 켜기’</b>를 다시 눌러주세요.</li>
    </ul>
  )
}

