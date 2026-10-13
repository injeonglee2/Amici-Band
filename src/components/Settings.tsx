import { useEffect, useState, type ReactNode } from 'react'
import { deleteFeedback, deleteMemberGroup, getActiveInviteCode, getBand, getMonthlyPracticeParticipation, kickMember, newId, rotateInviteCode, saveFcmToken, saveMemberGroup, saveWebPushSubscription, setFeedbackStatus, setMemberAdmin, watchAllBands, watchFeedback, watchMemberGroups, watchMembers } from '../data'
import { useAuth } from '../auth'
import { isStandaloneApp, mobileOS, notificationPermission, pushConfigured, requestNotificationRegistrations } from '../messaging'
import { canPromptInstall, isRelatedAppInstalled, runInstall, subscribeInstall } from '../install'
import { getCalendarExportMode, isAndroidDevice, setCalendarExportMode, type CalendarExportMode } from '../calendar'
import ThemeSelect from './ThemeSelect'
import ConfirmDialog from './ConfirmDialog'
import Segmented from './Segmented'
import Toast, { useToast } from './Toast'
import { CopyButton } from './CopyButton'
import Sheet from './Sheet'
import { versionLabel } from '../version'
import { useBackHandler } from '../backnav'
import { Icon } from '../icons'
import { PART_META, type Band, type Feedback, type Member, type MemberGroup, type Part } from '../types'
import { getTemplatePreview, getWorkspaceTemplate, setTemplatePreview, WORKSPACE_TEMPLATES, type WorkspaceTemplateId } from '../workspaceTemplates'
import FirebaseUsage from './FirebaseUsage'
import { FeedbackReplyComposer, FeedbackReplyList } from './FeedbackReplies'
import { TemplateSymbol } from './TemplateSymbol'

const fmtDay = (ms?: number) => {
  if (!ms) return '-'
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function Settings({ onClose, initialTab = 'general' }: { onClose: () => void; initialTab?: 'general' | 'band' }) {
  const { user, member, bandId, workspace, isDeveloper } = useAuth()
  const isAdmin = !!member?.admin
  // 관리 탭: 공동 채널의 관리자, 또는 역할 없이 모두가 같은 권한인 친구 채널의 모든 멤버
  const canManageChannel = (isAdmin || !!getWorkspaceTemplate(workspace?.templateId).equalMembers) && !!bandId && workspace?.templateId !== 'personal'
  const toast = useToast()
  const [devPopup, setDevPopup] = useState<null | 'firebase' | 'feedback'>(null)
  const [devFeedback, setDevFeedback] = useState<Feedback[]>([])
  const [tab, setTab] = useState<'general' | 'band' | 'dev'>(initialTab === 'band' && canManageChannel ? 'band' : 'general')
  const tabs: { k: 'general' | 'band' | 'dev'; label: string }[] = [
    { k: 'general', label: '일반' },
    ...(canManageChannel ? [{ k: 'band' as const, label: '관리' }] : []),
    ...(isDeveloper ? [{ k: 'dev' as const, label: '개발자' }] : []),
  ]
  useEffect(() => {
    if (!isDeveloper) return
    return watchFeedback(setDevFeedback, () => {})
  }, [isDeveloper])
  useBackHandler(() => (devPopup ? setDevPopup(null) : onClose()))
  return (
    <div className="app">
      <header className="top">
        <div className="brandrow">
          <button className="ghost-btn icon" onClick={onClose} aria-label="뒤로">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <div className="brand">
            <h1>설정</h1>
          </div>
        </div>
      </header>

      <main className="scroll">
        {tabs.length > 1 && (
          <Segmented className="set-seg" tabs={tabs} value={tab} onChange={(k) => setTab(k as 'general' | 'band' | 'dev')} />
        )}

        {tab === 'general' && (
          <>
            <NotifCard />
            <CalendarExportCard />
            <InstallAppEntry toast={toast} />
          </>
        )}

        {tab === 'band' && canManageChannel && bandId && (
          <>
            <MemberManageCard bandId={bandId} myUid={user?.uid ?? ''} toast={toast} />
            <InviteCodeCard bandId={bandId} toast={toast} />
          </>
        )}

        {tab === 'dev' && isDeveloper && (
          <>
            <TemplatePreviewCard />
            <BandsStatusCard />
            <button type="button" className="set-entry" onClick={() => setDevPopup('firebase')}>
              <span><b>Firebase 관리</b><small>사용량과 무료 한도 확인</small></span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </button>
            <button type="button" className="set-entry" onClick={() => setDevPopup('feedback')}>
              <span><b>받은 의견</b><small>버그 제보와 개선 의견 관리</small></span>
              <span className="set-entry-side">
                {devFeedback.filter((f) => f.status === 'new').length > 0 && <b className="fb-newbadge">{devFeedback.filter((f) => f.status === 'new').length}</b>}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </span>
            </button>
          </>
        )}

        <p className="app-ver">{versionLabel()}</p>
      </main>

      {devPopup === 'firebase' && (
        <DeveloperPopup
          title="Firebase 서비스별 사용량"
          onClose={() => setDevPopup(null)}
        >
          <FirebaseUsage />
        </DeveloperPopup>
      )}
      {devPopup === 'feedback' && (
        <DeveloperPopup title="받은 의견" onClose={() => setDevPopup(null)}>
          <AdminFeedbackCard toast={toast} list={devFeedback} />
        </DeveloperPopup>
      )}
      <Toast state={toast} />
    </div>
  )
}

function DeveloperPopup({ title, onClose, children, headerAction }: { title: string; onClose: () => void; children: React.ReactNode; headerAction?: React.ReactNode }) {
  return (
    <Sheet onClose={onClose} className="dev-popup-sheet">
      <div className="dev-popup-head">
        <h2>{title}</h2>
        <div className="dev-popup-head-actions">
          {headerAction}
          <button type="button" className="edit-btn" onClick={onClose} aria-label="닫기">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
      {children}
    </Sheet>
  )
}

function TemplatePreviewCard() {
  const { workspace } = useAuth()
  const saved = getTemplatePreview()
  const active = saved ?? getWorkspaceTemplate(workspace?.templateId).id
  function select(id: WorkspaceTemplateId) {
    setTemplatePreview(id === getWorkspaceTemplate(workspace?.templateId).id ? null : id)
    window.location.reload()
  }
  return (
    <div className="limits-card">
      <div className="limits-head">
        <h3>템플릿 미리보기</h3>
        <span className="guide-badge dev">소유자</span>
      </div>
      <p className="limits-note">현재 공간의 데이터는 바꾸지 않고 테마와 내비게이션만 시험합니다.</p>
      <div className="template-grid compact" role="radiogroup" aria-label="템플릿 미리보기">
        {Object.values(WORKSPACE_TEMPLATES).map((template) => (
          <button key={template.id} type="button" role="radio" aria-checked={active === template.id}
            className={'template-card' + (active === template.id ? ' on' : '')}
            style={{ ['--template-color' as string]: template.theme.accent }} onClick={() => select(template.id)}>
            <span className="template-symbol"><TemplateSymbol template={template} /></span><b>{template.label}</b>
          </button>
        ))}
      </div>
    </div>
  )
}

/** 관리자 전용: 이 밴드 초대 코드 보기 + 재발급(회전) */
function InviteCodeCard({ bandId, toast }: { bandId: string; toast: ReturnType<typeof useToast> }) {
  const { workspace } = useAuth()
  const equal = !!getWorkspaceTemplate(workspace?.templateId).equalMembers // 친구 채널은 모두가 초대 코드를 본다
  const [code, setCode] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    getActiveInviteCode(bandId)
      .then(setCode)
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [bandId])
  async function rotate() {
    if (busy) return
    setBusy(true)
    try {
      const r = await rotateInviteCode(bandId)
      setCode(r.code)
      toast.show('새 초대 코드를 발급했어요')
    } catch {
      toast.show('코드 재발급에 실패했어요')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="limits-card">
      <div className="limits-head">
        <h3>초대 코드</h3>
        {!equal && <span className="guide-badge">관리자</span>}
      </div>
      {code ? (
        <div className="invite-code-row">
          <button type="button" className="invite-rotate" onClick={() => void rotate()} disabled={busy}>
            {busy ? '발급 중…' : '재발급'}
          </button>
          <div className="invite-code">
            <span>{code}</span>
            <CopyButton text={code} onCopied={() => toast.show('코드를 복사했어요')} />
          </div>
        </div>
      ) : loaded ? (
        <button type="button" className="btn subtle block" onClick={() => void rotate()} disabled={busy}>
          {busy ? '발급 중…' : '코드 발급'}
        </button>
      ) : null}
    </div>
  )
}

/** 관리자 전용: 멤버 관리 — 관리자 지정/해제, 강퇴 */
function MemberManageCard({ bandId, myUid, toast }: { bandId: string; myUid: string; toast: ReturnType<typeof useToast> }) {
  const { workspace } = useAuth()
  // 파트·합주 참여 횟수·투표 대상 그룹은 밴드 채널에만 있는 개념이다.
  const isBandTemplate = getWorkspaceTemplate(workspace?.templateId).id === 'band'
  // 친구 채널: 역할이 없으므로 관리자 지정·표시 없이 모두가 멤버를 내보낼 수 있다
  const equal = !!getWorkspaceTemplate(workspace?.templateId).equalMembers
  const [members, setMembers] = useState<Member[]>([])
  const [ownerUid, setOwnerUid] = useState<string | null>(null)
  const [confirmKick, setConfirmKick] = useState<Member | null>(null)
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState(true)
  const [editing, setEditing] = useState(false)
  const [partFilter, setPartFilter] = useState<Part | 'all'>('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [practiceCounts, setPracticeCounts] = useState<Record<string, number> | null>(null)
  const [groups, setGroups] = useState<MemberGroup[]>([])
  const [groupEdit, setGroupEdit] = useState<MemberGroup | 'new' | null>(null)
  const [groupName, setGroupName] = useState('')
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([])
  useEffect(() => watchMembers(setMembers), [])
  useEffect(() => watchMemberGroups(setGroups, () => {}), [])
  useEffect(() => {
    getBand(bandId).then((b) => setOwnerUid(b?.ownerUid ?? null)).catch(() => {})
  }, [bandId])
  useEffect(() => {
    if (!open || !isBandTemplate) return
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    let active = true
    setPracticeCounts(null)
    getMonthlyPracticeParticipation(fmt(start), fmt(end))
      .then((counts) => { if (active) setPracticeCounts(counts) })
      .catch(() => { if (active) setPracticeCounts({}) })
    return () => { active = false }
  }, [bandId, open, isBandTemplate])
  const sorted = [...members].sort(
    (a, b) => (b.admin ? 1 : 0) - (a.admin ? 1 : 0) || (a.name ?? '').localeCompare(b.name ?? '', 'ko'),
  )
  // 파트별 필터: 실제로 멤버가 있는 파트만 칩으로 노출
  const partChips = (['drum', 'bass', 'guitar', 'keyboard', 'vocal'] as Part[])
    .map((p) => [p, members.filter((m) => m.part === p).length] as const)
    .filter(([, count]) => count > 0)
  const visible = partFilter === 'all' ? sorted : sorted.filter((m) => m.part === partFilter)
  async function toggleAdmin(m: Member) {
    setBusy(m.uid)
    try {
      await setMemberAdmin(bandId, m.uid, !m.admin)
      toast.show(m.admin ? '관리자를 해제했어요' : '관리자로 지정했어요')
    } catch {
      toast.show('변경에 실패했어요')
    } finally {
      setBusy('')
    }
  }
  async function doKick() {
    const m = confirmKick
    if (!m) return
    setConfirmKick(null)
    setBusy(m.uid)
    try {
      await kickMember(bandId, m.uid)
      toast.show(`${m.name ?? '멤버'} 님을 내보냈어요`)
    } catch {
      toast.show('내보내기에 실패했어요')
    } finally {
      setBusy('')
    }
  }
  function openGroup(group: MemberGroup | 'new') {
    setGroupEdit(group)
    setGroupName(group === 'new' ? '' : group.name)
    setGroupMemberIds(group === 'new' ? [] : group.memberIds)
  }
  async function storeGroup() {
    if (!groupName.trim() || groupMemberIds.length === 0) return
    const previous = groupEdit === 'new' ? null : groupEdit
    await saveMemberGroup({
      id: previous?.id ?? newId(),
      name: groupName.trim(),
      memberIds: groupMemberIds,
      createdBy: previous?.createdBy ?? myUid,
      createdAt: previous?.createdAt ?? Date.now(),
    })
    setGroupEdit(null)
    toast.show('멤버 그룹을 저장했어요')
  }
  async function removeGroup() {
    if (!groupEdit || groupEdit === 'new' || !confirm(`“${groupEdit.name}” 그룹을 삭제할까요?`)) return
    await deleteMemberGroup(groupEdit.id)
    setGroupEdit(null)
    toast.show('멤버 그룹을 삭제했어요')
  }
  return (
    <div className={'limits-card mm-card' + (open ? ' open' : '')}>
      <div className="limits-head mm-head">
        <button type="button" className="mm-toggle" onClick={() => { setOpen((o) => !o); if (open) setEditing(false) }} aria-expanded={open}>
          <h3>멤버{members.length > 0 && <b className="fb-newbadge"> {members.length}</b>}</h3>
          {!equal && <span className="guide-badge">관리자</span>}
        </button>
        {open && isBandTemplate && partChips.length > 1 && (
          <div className="mm-filter-wrap">
            <button type="button" className={'mm-filter-btn' + (filterOpen || partFilter !== 'all' ? ' on' : '')} onClick={() => setFilterOpen((v) => !v)} aria-label="파트 필터" aria-pressed={filterOpen}>
              <Icon name="filter" />
            </button>
            {filterOpen && (
              <div className="mm-filter-menu" onMouseLeave={() => setFilterOpen(false)}>
                <button type="button" className={partFilter === 'all' ? 'on' : ''} onClick={() => { setPartFilter('all'); setFilterOpen(false) }}>전체 <span>{members.length}</span></button>
                {partChips.map(([part, count]) => (
                  <button key={part} type="button" className={partFilter === part ? 'on' : ''} onClick={() => { setPartFilter(part); setFilterOpen(false) }}>{PART_META[part].label} <span>{count}</span></button>
                ))}
              </div>
            )}
          </div>
        )}
        {open && partFilter !== 'all' && (
          <span className="mm-active-filter">
            {PART_META[partFilter as Part].label}
            <button type="button" onClick={() => setPartFilter('all')} aria-label="필터 해제">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </span>
        )}
        <div className="mm-right">
          {open && (
            <button type="button" className={'mm-edit' + (editing ? ' on' : '')} onClick={() => setEditing((v) => !v)} aria-label={editing ? '편집 완료' : '멤버 편집'} title={editing ? '완료' : '편집'}>
              {editing ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              )}
            </button>
          )}
          <button type="button" className="mm-open" onClick={() => { setOpen((o) => !o); if (open) setEditing(false) }} aria-label={open ? '멤버 목록 닫기' : '멤버 목록 열기'}>
            <svg className={'mm-chev' + (open ? ' open' : '')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </button>
        </div>
      </div>
      {open && (
      <><ul className={'mm-list' + (editing ? ' editing' : '')}>
        {visible.map((m) => {
          const isOwner = m.uid === ownerUid
          const self = m.uid === myUid
          return (
            <li key={m.uid}>
              <span className="mm-name">
                {m.name || '(이름 설정 전)'}
                {!equal && isOwner && <em className="mm-tag owner">소유자</em>}
                {!equal && m.admin && !isOwner && <em className="mm-tag admin">관리자</em>}
              </span>
              {editing ? (
                !self && !isOwner ? (
                  <div className="mm-actions">
                    {!equal && (
                      <button type="button" className="btn subtle sm" disabled={busy === m.uid} onClick={() => void toggleAdmin(m)}>
                        {m.admin ? '관리자 해제' : '관리자 지정'}
                      </button>
                    )}
                    <button type="button" className="btn danger sm" disabled={busy === m.uid} onClick={() => setConfirmKick(m)}>내보내기</button>
                  </div>
                ) : null
              ) : isBandTemplate ? (
                <div className="mm-meta">
                  <span className="mm-part">{PART_META[m.part as Part]?.label ?? '파트 미정'}</span>
                  <span className="mm-sep" aria-hidden="true">·</span>
                  <em className="mm-practice-count" title="참석·늦참·조퇴 포함">이번달 참여 {practiceCounts === null ? '…' : `${practiceCounts[m.uid] ?? 0}회`}</em>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      {isBandTemplate && <>
      <div className="member-groups-head">
        <div><b>그룹</b><span>합주 참석 투표 대상을 묶어 관리해요.</span></div>
        <button type="button" className="btn subtle sm" onClick={() => openGroup('new')}>+ 그룹</button>
      </div>
      {groups.length > 0 && <div className="member-group-list">{groups.map((group) => (
        <button type="button" key={group.id} onClick={() => openGroup(group)}>
          <span><b>{group.name}</b><small>{group.memberIds.length}명</small></span><span aria-hidden="true">›</span>
        </button>
      ))}</div>}
      </>}
      </>
      )}
      {confirmKick && (
        <ConfirmDialog
          message={`${confirmKick.name ?? '이 멤버'} 님을 채널에서 내보낼까요?`}
          confirmLabel="내보내기"
          cancelLabel="닫기"
          confirmVariant="danger-solid"
          onConfirm={() => void doKick()}
          onCancel={() => setConfirmKick(null)}
        />
      )}
      {groupEdit && <Sheet onClose={() => setGroupEdit(null)}>
        <h2>{groupEdit === 'new' ? '멤버 그룹 추가' : '멤버 그룹 수정'}</h2>
        <div className="field"><label htmlFor="member-group-name">그룹 이름</label><input id="member-group-name" value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={30} autoFocus /></div>
        <div className="field"><label>멤버 선택</label><div className="member-group-picks">{sorted.map((person) => {
          const selected = groupMemberIds.includes(person.uid)
          return <button type="button" key={person.uid} className={selected ? 'on' : ''} aria-pressed={selected} onClick={() => setGroupMemberIds((ids) => selected ? ids.filter((id) => id !== person.uid) : [...ids, person.uid])}>
            <span className="member-group-check">{selected ? '✓' : ''}</span><span><b>{person.name || '(이름 설정 전)'}</b><small>{PART_META[person.part as Part]?.label ?? '파트 미정'}</small></span>
          </button>
        })}</div></div>
        <div className="actions">
          {groupEdit !== 'new' && <button type="button" className="btn danger" onClick={() => void removeGroup()}>삭제</button>}
          <button type="button" className="btn subtle" onClick={() => setGroupEdit(null)}>취소</button>
          <button type="button" className="btn primary" disabled={!groupName.trim() || groupMemberIds.length === 0} onClick={() => void storeGroup()}>저장</button>
        </div>
      </Sheet>}
    </div>
  )
}

/** 개발자 전용: 전체 밴드 현황 (과금 리스크 모니터링) */
function BandsStatusCard() {
  const [bands, setBands] = useState<Band[]>([])
  const [open, setOpen] = useState(false)
  useEffect(() => watchAllBands(setBands, () => {}), [])
  const personal = bands.filter((b) => b.templateId === 'personal')
  const friends = bands.filter((b) => b.templateId === 'friends')
  const shared = bands.filter((b) => b.templateId !== 'personal' && b.templateId !== 'friends')
  const renderBands = (items: Band[], personalChannel: boolean) => (
    <ul className="bands-list">
      {items.map((b) => (
        <li key={b.id}>
          <span className="bands-name">
            {b.name}
            {b.unlimited && <em className="bands-unl">무제한</em>}
          </span>
          <span className="bands-meta">
            {!personalChannel && <>{b.memberCount ?? 0}{b.unlimited ? '' : '/5'}명 · </>}
            {((b.storageBytes ?? 0) / 1048576).toFixed(1)}MB · AI {b.aiUsage?.count ?? 0}회 · {fmtDay(b.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  )
  return (
    <div className="limits-card">
      <div className={'limits-head bands-status-head' + (open ? ' open' : '')}>
        <h3>채널 현황{bands.length > 0 && <b className="fb-newbadge"> {bands.length}</b>}</h3>
        <span className="guide-badge dev">개발자</span>
        <button type="button" className="bands-collapse-btn" aria-label={open ? '채널 현황 접기' : '채널 현황 펼치기'} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <svg className={'mm-chev' + (open ? ' open' : '')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </button>
      </div>
      {open && (bands.length === 0 ? (
        <p className="app-ver" style={{ textAlign: 'left', margin: 0 }}>밴드가 없어요.</p>
      ) : (
        <div className="bands-groups">
          {shared.length > 0 && <section><h4>밴드 채널 <b>{shared.length}</b></h4>{renderBands(shared, false)}</section>}
          {friends.length > 0 && <section><h4>친구 채널 <b>{friends.length}</b></h4>{renderBands(friends, false)}</section>}
          {personal.length > 0 && <section><h4>개인 채널 <b>{personal.length}</b></h4>{renderBands(personal, true)}</section>}
        </div>
      ))}
    </div>
  )
}

const FB_TYPE_LABEL: Record<Feedback['type'], string> = { bug: '버그', idea: '개선', etc: '기타' }

/** 개발자 전용: 받은 의견·버그 제보 목록 + 처리 상태 토글 */
function AdminFeedbackCard({ toast, list }: { toast: ReturnType<typeof useToast>; list: Feedback[] }) {
  async function toggle(f: Feedback) {
    try {
      await setFeedbackStatus(f.id, f.status === 'new' ? 'done' : 'new')
    } catch {
      toast.show('상태 변경에 실패했어요.')
    }
  }
  async function remove(f: Feedback) {
    try {
      await deleteFeedback(f.id, f.images)
    } catch {
      toast.show('삭제에 실패했어요.')
    }
  }
  const when = (ms: number) => {
    const d = new Date(ms)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }

  return (
    <>
      {list.length === 0 ? (
        <p className="app-ver" style={{ textAlign: 'left', margin: 0 }}>아직 받은 의견이 없어요.</p>
      ) : (
        <ul className="fb-list">
          {list.map((f) => (
            <li key={f.id} className={'fb-item' + (f.status === 'done' ? ' done' : '')}>
              <div className="fb-item-head">
                <span className={'fb-badge fb-' + f.type}>{FB_TYPE_LABEL[f.type]}</span>
                <span className="fb-meta">{f.createdByName ?? '멤버'} · {when(f.createdAt)}</span>
              </div>
              <p className="fb-text">{f.text}</p>
              {f.images && f.images.length > 0 && (
                <div className="fb-thumbs">
                  {f.images.map((im, i) => (
                    <a key={i} href={im.url} target="_blank" rel="noopener noreferrer" className="fb-thumb">
                      <img src={im.url} alt="" loading="lazy" />
                    </a>
                  ))}
                </div>
              )}
              {(f.appVersion || f.userAgent) && (
                <p className="fb-ctx">v{f.appVersion} · {shortUA(f.userAgent)}</p>
              )}
              <FeedbackReplyList feedbackId={f.id} />
              <FeedbackReplyComposer feedbackId={f.id} toast={toast} />
              <div className="fb-item-actions">
                <button type="button" className="btn subtle" onClick={() => void toggle(f)}>
                  {f.status === 'done' ? '다시 열기' : '처리됨'}
                </button>
                <button type="button" className="btn danger" onClick={() => void remove(f)}>삭제</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** userAgent 에서 기기·브라우저만 짧게 */
function shortUA(ua?: string): string {
  if (!ua) return ''
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : '기타'
  const br = /CriOS|Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : ''
  return [os, br].filter(Boolean).join('·')
}

/** 캘린더 내보내기 방식 선택 — 네이티브 인텐트가 가능한 안드로이드에서만 노출 */
/**
 * 앱으로 설치 — 설치 안 된 브라우저에서만 보인다.
 * 크롬 정식 탭이면 누르는 즉시 네이티브 설치 창이 뜨고, 커스텀 탭처럼 설치 창을
 * 띄울 수 없는 곳이면 Play 스토어로 보낸다. 아이폰은 API 가 없어 방법만 알려준다.
 */
function InstallAppEntry({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [canPrompt, setCanPrompt] = useState(canPromptInstall())
  const [appInstalled, setAppInstalled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  useEffect(() => subscribeInstall(() => setCanPrompt(canPromptInstall())), [])
  useEffect(() => { void isRelatedAppInstalled().then(setAppInstalled) }, [])

  const os = mobileOS()
  if (isStandaloneApp() || appInstalled) return null
  if (!canPrompt && os === 'other') return null // 설치 경로가 없는 데스크톱 브라우저

  async function install() {
    if (busy) return
    setBusy(true)
    try {
      const result = await runInstall()
      if (result === 'installed') toast.show('설치했어요')
      else if (result === 'ios') setGuideOpen(true)
    } catch {
      toast.show('설치를 시작하지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className="set-entry" onClick={() => void install()} disabled={busy}>
        <span>
          <b>{os === 'ios' ? '홈 화면에 추가' : '앱으로 설치'}</b>
          {!canPrompt && os === 'android' && <small>Chrome으로 열어서 설치</small>}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
      </button>
      {guideOpen && <IosInstallGuide onClose={() => setGuideOpen(false)} />}
    </>
  )
}

/** 단계 하나 — 번호·할 일·그 순간의 화면 조각. */
function InstallStep({ step, label, children }: { step: number; label: string; children: ReactNode }) {
  return (
    <li className="install-step">
      <div className="install-step-head"><b>Step {step}</b><span>{label}</span></div>
      <div className="install-step-art" aria-hidden="true">
        <svg viewBox="0 0 220 44" role="presentation">
          <rect x="0.8" y="0.8" width="218.4" height="42.4" rx="11" className="art-panel" />
          {children}
        </svg>
      </div>
    </li>
  )
}

/**
 * 아이폰 설치 안내 — 사파리에는 설치 API 가 없어 사용자가 직접 눌러야 한다.
 * 어디를 눌러야 하는지 글로만 설명하면 못 찾으므로 단계마다 그 화면 조각을 그려 준다.
 */
function IosInstallGuide({ onClose }: { onClose: () => void }) {
  useBackHandler(onClose)
  return (
    <Sheet onClose={onClose} className="ios-install-sheet">
      <h2>홈 화면에 추가</h2>
      <ol className="install-steps">
        <InstallStep step={1} label="Safari로 열기">
          {/* 주소창 — 카카오톡 인앱 브라우저가 아니라 사파리여야 한다 */}
          <circle cx="26" cy="22" r="10" className="art-line" />
          <path d="M30.5 17.5 27 27l-9.5 3.5L21 21Z" className="art-fill-accent" />
          <rect x="46" y="14" width="134" height="16" rx="8" className="art-soft" />
          <text x="113" y="25.5" textAnchor="middle" className="art-text">amicicalender.web.app</text>
          <path d="M194 18a6 6 0 1 0 2-4.5" className="art-soft-line" />
          <path d="M196 10v4h-4" className="art-soft-line" />
        </InstallStep>

        <InstallStep step={2} label="아래 공유 버튼">
          {/* 사파리 하단 툴바. 가운데 공유 버튼만 강조 */}
          <path d="M33 16l-6 6 6 6" className="art-soft-line" />
          <path d="M65 16l6 6-6 6" className="art-soft-line" />
          <circle cx="110" cy="22" r="16" className="art-ring-accent" />
          <path d="M110 13v12M110 13l-4 4M110 13l4 4" className="art-line" />
          <rect x="102" y="21" width="16" height="10" rx="3" className="art-line" />
          <path d="M152 15h12v14h-12z" className="art-soft-line" />
          <path d="M158 15v14" className="art-soft-line" />
          <rect x="184" y="15" width="14" height="14" rx="3" className="art-soft-line" />
        </InstallStep>

        <InstallStep step={3} label="목록에서 ‘홈 화면에 추가’">
          <text x="16" y="26.5" className="art-text lg">홈 화면에 추가</text>
          <rect x="182" y="12" width="20" height="20" rx="5" className="art-line" />
          <path d="M192 17v10M187 22h10" className="art-line" />
        </InstallStep>

        <InstallStep step={4} label="‘웹 앱으로 열기’ 켜짐 확인">
          <text x="16" y="26.5" className="art-text lg">웹 앱으로 열기</text>
          <rect x="170" y="12" width="34" height="20" rx="10" className="art-fill-accent" />
          <circle cx="194" cy="22" r="8" className="art-knob" />
        </InstallStep>

        <InstallStep step={5} label="오른쪽 위 ‘추가’">
          <text x="14" y="26.5" className="art-text">취소</text>
          <text x="110" y="26.5" textAnchor="middle" className="art-text lg">홈 화면에 추가</text>
          <text x="206" y="26.5" textAnchor="end" className="art-text accent">추가</text>
        </InstallStep>
      </ol>
      <button type="button" className="btn primary block" onClick={onClose}>확인</button>
    </Sheet>
  )
}

function CalendarExportCard() {
  const [mode, setMode] = useState<CalendarExportMode>(getCalendarExportMode())
  if (!isAndroidDevice()) return null // iOS·데스크톱은 항상 .ics 라 선택이 무의미
  return (
    <div className="limits-card">
      <div className="limits-head">
        <h3>캘린더 내보내기</h3>
      </div>
      <ThemeSelect
        title="캘린더 내보내기 방식"
        value={mode}
        onChange={(v) => {
          const m = v as CalendarExportMode
          setCalendarExportMode(m)
          setMode(m)
        }}
        options={[
          { value: 'auto', label: '앱에서 바로 추가 (삼성·구글 캘린더)' },
          { value: 'ics', label: '파일(.ics)로 열기 (아이폰 등)' },
        ]}
      />
    </div>
  )
}

function NotifCard() {
  const { user, bandId, isChannelMember } = useAuth()
  const [state, setState] = useState<'idle' | 'enabling' | 'on' | 'off' | 'denied' | 'unavailable'>(
    !pushConfigured()
      ? 'unavailable'
      : notificationPermission() === 'granted'
        ? 'on'
        : notificationPermission() === 'denied'
          ? 'denied'
          : 'idle',
  )

  async function enable() {
    if (!user || !isChannelMember) return
    setState('enabling')
    try {
      const { fcmToken, webPushSubscription } = await requestNotificationRegistrations()
      if (fcmToken || webPushSubscription) {
        await Promise.all([
          fcmToken ? saveFcmToken(user.uid, fcmToken) : Promise.resolve(),
          webPushSubscription
            ? saveWebPushSubscription(user.uid, webPushSubscription)
            : Promise.resolve(),
        ])
        setState('on')
      } else {
        setState(notificationPermission() === 'denied' ? 'denied' : 'off')
      }
    } catch {
      setState('off')
    }
  }

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'hidden' || !pushConfigured()) return
      const permission = notificationPermission()
      if (permission === 'granted') {
        void enable()
      } else {
        setState(permission === 'denied' ? 'denied' : 'idle')
      }
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
    // 채널을 바꾸면 현재 채널의 멤버 문서에 알림 기기를 다시 연결한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, bandId, isChannelMember])

  const msg = !isChannelMember
    ? '개발자 점검 모드에서는 이 채널에 기기 알림 정보를 추가하지 않아요.'
    :
    state === 'on'
      ? '이 기기에서 알림을 받는 중이에요.'
      : state === 'denied'
        ? mobileOS() === 'android' && isStandaloneApp()
          ? 'Chrome 사이트 알림과 기기 설정의 Amici 알림을 모두 확인해 주세요.'
          : '브라우저에서 알림이 차단됐어요. 사이트 설정에서 허용해 주세요.'
        : state === 'unavailable'
          ? '이 환경에서는 알림을 사용할 수 없어요. (설정 필요 또는 미지원 브라우저)'
          : '새 일정·투표 요청 알림을 이 기기에서 받으려면 켜주세요.'

  return (
    <div className="notif-card">
      <div className="notif-info">
        <h3>알림</h3>
        <p>{msg}</p>
      </div>
      {state === 'on' ? (
        <span className="notif-on">✓ 켜짐</span>
      ) : state === 'idle' || state === 'off' || state === 'enabling' ? (
        <button className="btn primary" onClick={enable} disabled={state === 'enabling'}>
          {state === 'enabling' ? '설정 중…' : '알림 켜기'}
        </button>
      ) : null}
    </div>
  )
}
