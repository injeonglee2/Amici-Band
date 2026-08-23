import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth'
import { loadOlderEvents, saveFcmToken, saveWebPushSubscription, watchEvents, watchMembers, watchPlaces } from '../data'
import { TYPE_META, type BandEvent, type EventType, type Member, type Place } from '../types'
import { dayDiff, ddayLabel, longWhen, parseDate, todayStr } from '../time'
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
import CalendarView from './CalendarView'
import Segmented from './Segmented'
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
import { getTemplatePreview, getWorkspaceTemplate, workspaceThemeStyle, type WorkspaceNavId } from '../workspaceTemplates'
import { BAND_RECORDING_MODULE } from '../recordingModules'
import PersonalVideos from './PersonalVideos'
import Onboarding from './Onboarding'
import PersonalRecords from './PersonalRecords'
import { useWorkspaceTheme } from '../useWorkspaceTheme'

type Filter = 'all' | EventType

/** 오늘부터 1년 전 날짜(YYYY-MM-DD) — 지난 일정 기본 조회 창의 하한 */
function oneYearAgoStr(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Main() {
  const { member, bandId, workspace, channels, isDeveloper, isChannelMember, switchChannel, signOutUser } = useAuth()
  const isAdmin = !!member?.admin
  const workspaceTemplate = getWorkspaceTemplate(isDeveloper ? (getTemplatePreview() ?? workspace?.templateId) : workspace?.templateId)
  useWorkspaceTheme(workspaceTemplate)
  const [events, setEvents] = useState<BandEvent[]>([]) // 실시간: date >= 1년 전 (미래 포함)
  const [olderEvents, setOlderEvents] = useState<BandEvent[]>([]) // '더보기'로 불러온 1년 이전 지난 일정
  const [olderCursor, setOlderCursor] = useState(() => oneYearAgoStr())
  const [hasMorePast, setHasMorePast] = useState(false) // 1년 이전 일정이 있다고 확인되면 true
  const [probedOlder, setProbedOlder] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [places, setPlaces] = useState<Place[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [view, setView] = useState<'list' | 'calendar'>('list')
  // 캘린더 월 이동/선택 상태 (월 이동 컨트롤은 상단 바에 둔다)
  const [calCursor, setCalCursor] = useState(() => {
    const t = new Date()
    return { y: t.getFullYear(), m: t.getMonth() }
  })
  const [calSelected, setCalSelected] = useState(() => todayStr())
  const [nav, setNav] = useState<WorkspaceNavId>(() => workspaceTemplate.navigation[0]?.id ?? 'home')
  const [placesErr, setPlacesErr] = useState('')
  const [editing, setEditing] = useState<BandEvent | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [channelOnboarding, setChannelOnboarding] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const toast = useToast()

  // 템플릿별 활성 탭만 허용한다. 이후 개인 기록 모듈도 navigation 설정만 추가하면 진입 가능하다.
  useEffect(() => {
    if (!workspaceTemplate.navigation.some((item) => item.id === nav)) {
      setNav(workspaceTemplate.navigation[0]?.id ?? 'home')
    }
  }, [nav, workspaceTemplate])

  async function selectChannel(nextBandId: string) {
    if (nextBandId === bandId) { setMenuOpen(false); return }
    await switchChannel(nextBandId)
    window.location.reload()
  }

  useEffect(
    () =>
      watchEvents(
        setEvents,
        (e) => {
          const code = (e as { code?: string })?.code ?? ''
          setLoadErr(
            code === 'permission-denied'
              ? '일정을 불러올 권한이 없어요. Firestore 보안 규칙이 게시됐는지 확인해 주세요.'
              : '일정을 불러오지 못했어요.' + (code ? ` (${code})` : ''),
          )
        },
        oneYearAgoStr(), // 최근 1년 + 미래만 실시간 구독 (읽기 비용 상한). 그 이전은 '더보기'
      ),
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
  // 지난 일정 탭을 처음 열 때, 1년 이전 일정이 있는지 1건만 확인해 '더보기' 노출 여부 결정
  useEffect(() => {
    if (tab !== 'past' || probedOlder) return
    setProbedOlder(true)
    loadOlderEvents(oneYearAgoStr(), 1)
      .then((r) => setHasMorePast(r.length > 0))
      .catch(() => {})
  }, [tab, probedOlder])
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
    if (!member || !isChannelMember) return
    autoRegisterPush().then((registrations) => {
      if (!registrations) return
      const { fcmToken, webPushSubscription } = registrations
      void Promise.all([
        fcmToken ? saveFcmToken(member.uid, fcmToken) : Promise.resolve(),
        webPushSubscription ? saveWebPushSubscription(member.uid, webPushSubscription) : Promise.resolve(),
      ])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.uid, bandId, isChannelMember])

  // ── 안드로이드 물리 뒤로가기 ──
  // 열린 다이얼로그·시트·상세는 각 컴포넌트가 useBackHandler 로 자기 닫기를 등록한다
  // (등록 시점 = 화면 열림에 히스토리 항목이 쌓인다). 사용자 메뉴·탭(음악/장소)→홈도 같은 방식.
  useBackHandler(() => setMenuOpen(false), menuOpen)
  useBackHandler(() => setView('list'), view === 'calendar')
  useBackHandler(() => setNav('home'), nav !== 'home')
  useAndroidBack(() => toast.show('한 번 더 누르면 종료됩니다'))

  const placesMap = useMemo(() => new Map(places.map((p) => [p.id, p])), [places])

  const sorted = useMemo(
    () => [...events, ...olderEvents].sort((a, b) => (a.date + a.rehStart).localeCompare(b.date + b.rehStart)),
    [events, olderEvents],
  )
  const upcoming = useMemo(() => sorted.filter((e) => dayDiff(e.date) >= 0), [sorted])
  // 지난 일정: 최신순(방금 끝난 것부터)
  const past = useMemo(() => sorted.filter((e) => dayDiff(e.date) < 0).reverse(), [sorted])
  const next = upcoming[0]
  const base = tab === 'upcoming' ? upcoming : past
  const list = base.filter((e) => filter === 'all' || e.type === filter)
  // 캘린더 뷰: 지난/다가오는 구분 없이 유형 필터만 적용한 전체 일정
  const calEvents = useMemo(
    () => sorted.filter((e) => filter === 'all' || e.type === filter),
    [sorted, filter],
  )

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

  async function loadMorePast() {
    if (loadingMore || !hasMorePast) return
    setLoadingMore(true)
    try {
      const batch = await loadOlderEvents(olderCursor, 20)
      if (batch.length) {
        setOlderEvents((prev) => [...prev, ...batch])
        setOlderCursor(batch[batch.length - 1].date) // 다음 '더보기'는 이보다 더 이전
      }
      if (batch.length < 20) setHasMorePast(false) // 더 없음 → 버튼 숨김
    } catch {
      toast.show('지난 일정을 더 불러오지 못했어요')
    } finally {
      setLoadingMore(false)
    }
  }

  function calShift(delta: number) {
    const d = new Date(calCursor.y, calCursor.m + delta, 1)
    setCalCursor({ y: d.getFullYear(), m: d.getMonth() })
  }
  function calToday() {
    const t = new Date()
    setCalCursor({ y: t.getFullYear(), m: t.getMonth() })
    setCalSelected(todayStr())
  }

  function openAdd() {
    setEditing(null)
    setFormOpen(true)
  }
  function openEdit(ev: BandEvent) {
    setEditing(ev)
    setFormOpen(true)
  }

  if (channelOnboarding) return <Onboarding onCancel={() => setChannelOnboarding(false)} />
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
    <div className="app" data-template={workspaceTemplate.id} style={workspaceThemeStyle(workspaceTemplate)}>
      <header className="top">
        <div className="brandrow">
          <div className="mark">
            <img src="/logo.png" alt="Amici Band" />
          </div>
          <div className="brand">
            <span className="workspace-context"><i>{workspaceTemplate.symbol}</i>{workspaceTemplate.label}</span>
            <h1>{nav === 'home' ? (workspace?.name || 'Amici Band') : workspaceTemplate.navigation.find((item) => item.id === nav)?.label}</h1>
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
                {isDeveloper && channels.map((channel) => (
                  <button key={channel.id} className={channel.id === bandId ? 'active' : ''} onClick={() => void selectChannel(channel.id)}>
                    <span>{channel.name}</span>{channel.id === bandId && <small>사용 중</small>}
                  </button>
                ))}
                {isDeveloper && <div className="menu-divider" />}
                {isDeveloper && <button onClick={() => { setMenuOpen(false); setChannelOnboarding(true) }}>채널 추가</button>}
                <button onClick={signOutUser}>로그아웃</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <NotifBanner />

      {nav === 'home' ? (
      <>
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

      <div className="home-topbar">
        {view === 'list' ? (
          <Segmented
            tabs={[
              { k: 'upcoming', label: '다가오는' },
              { k: 'past', label: '지난 일정', badge: past.length },
            ]}
            value={tab}
            onChange={(k) => setTab(k as 'upcoming' | 'past')}
          />
        ) : (
          <div className="cal-navbar">
            <button className="cal-nav" onClick={() => calShift(-1)} aria-label="이전 달">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <button className="cal-title" onClick={calToday}>{calCursor.y}년 {calCursor.m + 1}월</button>
            <button className="cal-nav" onClick={() => calShift(1)} aria-label="다음 달">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>
        )}
        <div className="view-toggle" role="tablist" aria-label="보기 방식">
          <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} aria-label="목록 보기" title="목록">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
          </button>
          <button role="tab" aria-selected={view === 'calendar'} className={view === 'calendar' ? 'on' : ''} onClick={() => setView('calendar')} aria-label="캘린더 보기" title="캘린더">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
          </button>
        </div>
      </div>

      <main className="scroll">
        {loadErr && <div className="banner-err">{loadErr}</div>}
        {view === 'calendar' ? (
          <CalendarView events={calEvents} placesMap={placesMap} members={members} toast={toast} onEdit={openEdit} cursor={calCursor} selected={calSelected} onSelect={setCalSelected} />
        ) : (
        <>
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

        {tab === 'past' && hasMorePast && (
          <button type="button" className="more-past" onClick={() => void loadMorePast()} disabled={loadingMore}>
            {loadingMore ? '불러오는 중…' : '더보기'}
          </button>
        )}
        </>
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
        workspaceTemplate.id === 'personal'
          ? <PersonalVideos toast={toast} />
          : <RecordingsView toast={toast} config={BAND_RECORDING_MODULE} />
      ) : nav === 'journal' ? (
        <PersonalRecords toast={toast} />
      ) : nav === 'scores' ? (
        <ScoresView toast={toast} />
      ) : (
        <MusicView toast={toast} />
      )}

      <nav className="bottom-nav" role="tablist" aria-label="주 메뉴">
        {workspaceTemplate.navigation.map((item) => (
          <button key={item.id} role="tab" aria-selected={nav === item.id}
            className={'navitem' + (nav === item.id ? ' on' : '')} style={{ gridColumn: item.slot }}
            onClick={() => setNav(item.id)}>
            <NavIcon id={item.id} />
            {item.label}
          </button>
        ))}
      </nav>

      {formOpen && (
        <EventForm editing={editing} places={places} onClose={() => setFormOpen(false)} />
      )}

      <Toast state={toast} />
    </div>
  )
}

function NavIcon({ id }: { id: WorkspaceNavId }) {
  if (id === 'music') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
  if (id === 'scores') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></svg>
  if (id === 'recordings') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m10 9 5 3-5 3z" /></svg>
  if (id === 'journal') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
  if (id === 'places') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
}

/**
 * 알림이 꺼진 멤버에게 상단에 '알림 켜기' 배너를 노출(투표 요청 등 푸시를 받으려면 각자 켜야 함).
 * 버튼(사용자 제스처)으로 권한을 요청하므로 자동 요청보다 확실히 팝업이 뜬다.
 * 아이폰(미설치)은 홈 화면 추가 안내만 보여준다.
 */
function NotifBanner() {
  const { user, isChannelMember } = useAuth()
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(notificationPermission())
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    const refreshPermission = () => {
      if (document.visibilityState === 'hidden') return
      setPerm(notificationPermission())
    }
    window.addEventListener('focus', refreshPermission)
    window.addEventListener('pageshow', refreshPermission)
    document.addEventListener('visibilitychange', refreshPermission)
    return () => {
      window.removeEventListener('focus', refreshPermission)
      window.removeEventListener('pageshow', refreshPermission)
      document.removeEventListener('visibilitychange', refreshPermission)
    }
  }, [])

  if (!user || !isChannelMember || dismissed) return null
  // 배너는 사용자가 제어할 수 있는 웹 알림 권한만 기준으로 삼는다.
  // 토큰 갱신은 Main의 백그라운드 등록 effect가 담당하며, 실패해도 허용 안내를 반복하지 않는다.
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
        {!iosInstall &&
          (denied ? (
            // 차단 상태: 브라우저가 권한 팝업 재요청을 막으므로 '알림 켜기'는 눌러도 안 켜진다.
            // 헷갈리지 않게 설정 방법을 펼치는 버튼으로 바꾼다.
            <button
              type="button"
              className="btn primary notif-banner-btn"
              onClick={() => setHelpOpen((o) => !o)}
              aria-expanded={helpOpen}
            >
              {helpOpen ? '접기' : '켜는 법'}
            </button>
          ) : (
            // 미결정 상태: 버튼(사용자 제스처) 한 번으로 네이티브 권한 팝업이 바로 뜬다.
            <button
              type="button"
              className="btn primary notif-banner-btn"
              onClick={() => void enable()}
              disabled={busy}
            >
              {busy ? '켜는 중…' : '알림 켜기'}
            </button>
          ))}
        <button type="button" className="notif-banner-x" onClick={() => setDismissed(true)} aria-label="닫기">×</button>
      </div>
      {!iosInstall && denied && helpOpen && (
        <div className="notif-banner-help">
          <NotifHelpSteps />
        </div>
      )}
    </div>
  )
}

/** 알림 차단 해제 방법 — iOS / 안드로이드(설치 여부) / 데스크톱에 맞춰 안내 */
function NotifHelpSteps() {
  const os = mobileOS()
  const standalone = isStandaloneApp()

  return (
    <ul className="notif-help-steps">
      {os === 'ios' ? (
        <li>
          <b>iPhone 설정 → 알림 → Amici</b> → ‘알림 허용’ 켜기
          <span className="notif-help-sub">(홈 화면에 추가된 앱에서만 알림을 받을 수 있어요)</span>
        </li>
      ) : os === 'android' ? (
        <>
          <li><b>Chrome → amicicalender.web.app → 사이트 설정 → 알림</b> → 허용</li>
          {standalone && <li><b>기기 설정 → 앱 → Amici → 알림</b> → 알림 허용</li>}
        </>
      ) : (
        <li>주소창 왼쪽 <b>자물쇠(사이트 정보) → 알림</b> → 허용</li>
      )}
      <li>허용한 뒤 이 화면을 <b>새로고침</b>하면 알림이 켜져요.</li>
    </ul>
  )
}

