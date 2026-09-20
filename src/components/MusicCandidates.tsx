import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { deleteEvent, newId, saveEvent, savePlaylist, saveTrack, updateMusicTrack, watchAllMusicTracks, watchMembers, watchPlaylists } from '../data'
import type { Member, Playlist, Track } from '../types'
import { thumbnailUrl } from '../youtube'
import SetlistPlayer from './SetlistPlayer'
import type { ToastState } from './Toast'
import Sheet from './Sheet'
import ConfirmDialog from './ConfirmDialog'
import ThemeSelect from './ThemeSelect'

export default function MusicCandidates({ playlist, toast, editMode, onEditTrack, onDeleteTrack, onAdd, settingsOpen, onSettingsOpen, onSettingsClose }: { playlist: Playlist; toast: ToastState; editMode: boolean; onEditTrack: (track: Track) => void; onDeleteTrack: (track: Track) => void; onAdd: () => void; settingsOpen: boolean; onSettingsOpen: () => void; onSettingsClose: () => void }) {
  const { member } = useAuth()
  const [tracks, setTracks] = useState<Track[]>([])
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [selectionCount, setSelectionCount] = useState(1)
  const [members, setMembers] = useState<Member[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [voterLimits, setVoterLimits] = useState<Record<string, number>>({})
  const [targetPlaylistId, setTargetPlaylistId] = useState('')
  const [editingVote, setEditingVote] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [openingNewVote, setOpeningNewVote] = useState(false)
  const [voteDeadline, setVoteDeadline] = useState('')

  useEffect(() => watchAllMusicTracks(playlist.id, setTracks, (e) => setError(e.message)), [playlist.id])
  useEffect(() => watchMembers(setMembers, () => {}), [])
  useEffect(() => watchPlaylists(setPlaylists, () => {}), [])
  useEffect(() => {
    if (!settingsOpen) return
    setSelectionCount(playlist.voteSelectionCount ?? 1)
    setVoterLimits(playlist.voteOpen ? (playlist.voteVoterLimits ?? {}) : {})
    setTargetPlaylistId(playlist.voteTargetPlaylistId ?? '')
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    now.setDate(now.getDate() + 7)
    const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    setVoteDeadline(playlist.voteDeadline && playlist.voteDeadline >= today ? playlist.voteDeadline : fallback)
    setEditingVote(false)
    setOpeningNewVote(false)
  }, [settingsOpen, playlist.voteOpen, playlist.voteSelectionCount, playlist.voteVoterLimits, playlist.voteTargetPlaylistId])

  const recommendationTracks = tracks
    .filter((track) => track.candidateStatus)
    .sort((a, b) => {
      const voteDiff = Object.values(b.votes || {}).filter(Boolean).length - Object.values(a.votes || {}).filter(Boolean).length
      return voteDiff || (a.order ?? a.addedAt) - (b.order ?? b.addedAt)
    })
  const candidates = recommendationTracks.filter((track) => track.candidateStatus !== 'selected')
  const playingIndex = recommendationTracks.findIndex((track) => track.id === playingId)
  const playing = playingIndex >= 0 ? recommendationTracks[playingIndex] : null
  const voteOpen = playlist.voteOpen === true
  const winnerCount = Math.max(1, playlist.voteSelectionCount ?? 1)
  const maxVotes = member ? Math.max(0, playlist.voteVoterLimits?.[member.uid] ?? 0) : 0
  const myVoteCount = member ? candidates.filter((track) => track.votes?.[member.uid]).length : 0
  const canVote = member?.part === 'vocal' && maxVotes > 0
  const vocalMembers = members.filter((item) => item.part === 'vocal')
  const performancePlaylists = playlists.filter((item) => item.templateId === 'performance')
  const selectedResults = tracks.filter((track) => playlist.lastSelectedTrackIds?.includes(track.id))
  const hasSavedResults = selectedResults.length > 0
  const selectedVocalIds = vocalMembers.filter((vocal) => (voterLimits[vocal.uid] ?? 0) > 0).map((vocal) => vocal.uid)
  const allVocalsSelected = vocalMembers.length > 0 && selectedVocalIds.length === vocalMembers.length

  function toggleAllVocals(checked: boolean) {
    setVoterLimits(Object.fromEntries(vocalMembers.map((vocal) => [vocal.uid, checked ? selectionCount : 0])))
  }

  function changeSelectionCount(value: number) {
    const next = Math.max(1, Math.min(value || 1, Math.max(1, candidates.length)))
    setSelectionCount(next)
    setVoterLimits((current) => Object.fromEntries(Object.entries(current).map(([uid, limit]) => [uid, limit > 0 ? next : 0])))
  }

  async function update(track: Track, data: Record<string, unknown>) {
    if (busyId) return
    setBusyId(track.id)
    setError('')
    try {
      await updateMusicTrack(playlist.id, track.id, data)
    } catch {
      setError('저장하지 못했어요. 다시 시도해 주세요.')
    } finally {
      setBusyId(null)
    }
  }

  async function openVote() {
    if (!member?.admin || busyId || candidates.length === 0) return
    const count = Math.max(1, Math.min(selectionCount, candidates.length))
    const enabledLimits = Object.fromEntries(Object.entries(voterLimits).filter(([, limit]) => limit > 0).map(([uid]) => [uid, count]))
    if (!Object.keys(enabledLimits).length) {
      setError('투표에 참여할 보컬을 한 명 이상 선택해 주세요.')
      return
    }
    setBusyId('vote-session')
    setError('')
    try {
      await Promise.all(candidates.map((track) => updateMusicTrack(playlist.id, track.id, { votes: {} })))
      await Promise.all([
        savePlaylist({ ...playlist, voteOpen: true, voteSelectionCount: count, voteVoterLimits: enabledLimits, lastSelectedTrackIds: [], voteLinkedPlaylistIds: [], voteOpenedAt: Date.now(), voteDeadline }),
        saveEvent({ id: `recommendation-vote-deadline-${playlist.id}`, type: 'practice', title: '추천곡 투표 마감', date: voteDeadline, rehStart: '23:59', rehEnd: '23:59', recommendationPlaylistId: playlist.id, recommendationPlaylistName: playlist.name, musicDeadlineKind: 'vote', voteSelectionCount: count, note: '', createdBy: member.uid, createdAt: Date.now() }),
      ])
      toast.show(`${count}곡 선정 투표를 시작했어요`)
      onSettingsClose()
    } catch {
      setError('투표를 시작하지 못했어요. 다시 시도해 주세요.')
    } finally {
      setBusyId(null)
    }
  }

  async function saveVoteChanges() {
    if (!member?.admin || busyId) return
    const count = Math.max(1, Math.min(selectionCount, candidates.length))
    const enabledLimits = Object.fromEntries(Object.entries(voterLimits).filter(([, limit]) => limit > 0).map(([uid]) => [uid, count]))
    if (!Object.keys(enabledLimits).length) return
    setBusyId('vote-session')
    setError('')
    try {
      await Promise.all(candidates.map((track) => {
        const nextVotes = { ...(track.votes ?? {}) }
        Object.keys(nextVotes).forEach((uid) => { if (!enabledLimits[uid]) delete nextVotes[uid] })
        return updateMusicTrack(playlist.id, track.id, { votes: nextVotes })
      }))
      // 한도가 줄어든 보컬은 목록 순서 기준으로 초과 선택을 해제한다.
      for (const uid of Object.keys(enabledLimits)) {
        const selected = candidates.filter((track) => track.votes?.[uid])
        await Promise.all(selected.slice(count).map((track) => updateMusicTrack(playlist.id, track.id, { [`votes.${uid}`]: false })))
      }
      await Promise.all([
        savePlaylist({ ...playlist, voteOpen: true, voteSelectionCount: count, voteVoterLimits: enabledLimits, voteDeadline }),
        saveEvent({ id: `recommendation-vote-deadline-${playlist.id}`, type: 'practice', title: '추천곡 투표 마감', date: voteDeadline, rehStart: '23:59', rehEnd: '23:59', recommendationPlaylistId: playlist.id, recommendationPlaylistName: playlist.name, musicDeadlineKind: 'vote', voteSelectionCount: count, note: '', createdBy: member.uid, createdAt: playlist.voteOpenedAt ?? Date.now() }),
      ])
      toast.show('투표 설정을 수정했어요')
      onSettingsClose()
    } catch {
      setError('투표 설정을 수정하지 못했어요.')
    } finally {
      setBusyId(null)
    }
  }

  async function cancelVote() {
    if (!member?.admin || busyId) return
    setBusyId('vote-session')
    setError('')
    try {
      await Promise.all(candidates.map((track) => updateMusicTrack(playlist.id, track.id, { votes: {} })))
      await Promise.all([savePlaylist({ ...playlist, voteOpen: false }), deleteEvent(`recommendation-vote-deadline-${playlist.id}`)])
      toast.show('투표를 취소했어요')
      setCancelConfirm(false)
      onSettingsClose()
    } catch {
      setError('투표를 취소하지 못했어요.')
    } finally {
      setBusyId(null)
    }
  }

  async function closeVote() {
    if (!member?.admin || busyId) return
    const ranked = candidates.map((track) => ({ track, votes: Object.values(track.votes || {}).filter(Boolean).length }))
      .sort((a, b) => b.votes - a.votes || (a.track.order ?? a.track.addedAt) - (b.track.order ?? b.track.addedAt))
    const winners = ranked.slice(0, winnerCount)
    const cutoff = winners.at(-1)?.votes ?? 0
    const tiedAtCutoff = ranked.filter((item) => item.votes === cutoff).length
    const tiedWinners = winners.filter((item) => item.votes === cutoff).length
    if (ranked.length > winnerCount && tiedAtCutoff > tiedWinners) {
      setError(`선정 경계에서 ${cutoff}표 동점이 발생했어요. 결선 투표 후 종료해 주세요.`)
      return
    }
    setBusyId('vote-session')
    setError('')
    try {
      await Promise.all(winners.map(({ track }) => updateMusicTrack(playlist.id, track.id, { candidateStatus: 'selected' })))
      await Promise.all([savePlaylist({ ...playlist, voteOpen: false, lastSelectedTrackIds: winners.map(({ track }) => track.id), voteLinkedPlaylistIds: [] }), deleteEvent(`recommendation-vote-deadline-${playlist.id}`)])
      toast.show(`${winners.length}곡을 선정했어요`)
    } catch {
      setError('투표를 종료하지 못했어요. 다시 시도해 주세요.')
    } finally {
      setBusyId(null)
    }
  }

  async function linkSelectedTracks() {
    if (!targetPlaylistId || busyId || !selectedResults.length) return
    setBusyId('link-results')
    try {
      const now = Date.now()
      await Promise.all(selectedResults.map((track, index) => saveTrack(targetPlaylistId, {
        ...track, id: newId(), order: now + index, addedAt: now + index,
        candidateStatus: undefined, votes: undefined, reviews: undefined, recommendation: undefined,
      })))
      await savePlaylist({ ...playlist, voteLinkedPlaylistIds: [...new Set([...(playlist.voteLinkedPlaylistIds ?? []), targetPlaylistId])] })
      toast.show('선정곡을 재생목록에 추가했어요')
      setTargetPlaylistId('')
    } catch {
      setError('선정곡을 추가하지 못했어요.')
    } finally {
      setBusyId(null)
    }
  }

  return <>
    <main className="scroll">
      {error && <div className="banner-err">{error}</div>}
      {voteOpen && <p className="hint">보컬 투표 진행 중{canVote ? ` · 나는 최대 ${maxVotes}곡 선택` : ''}</p>}
      {voteOpen && member && !canVote && <p className="hint">이번 투표는 보컬 파트 멤버만 참여할 수 있어요.</p>}
      {playing && <SetlistPlayer
        track={playing}
        index={playingIndex}
        total={recommendationTracks.length}
        hasPrev={playingIndex > 0}
        hasNext={playingIndex < recommendationTracks.length - 1}
        onPrev={() => setPlayingId(recommendationTracks[playingIndex - 1]?.id ?? null)}
        onNext={() => setPlayingId(recommendationTracks[playingIndex + 1]?.id ?? null)}
        onEnded={() => setPlayingId(recommendationTracks[playingIndex + 1]?.id ?? playing.id)}
        onClose={() => setPlayingId(null)}
      />}

      {recommendationTracks.length === 0 ? <div className="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
        <p>추천곡이 없어요.<br />아래 <b>+ 곡 추가</b>로 추천할 곡을 넣어보세요.</p>
      </div> : <>
        {!editMode && <div className="setlist-actions">
          <button className="btn primary play-all" onClick={() => setPlayingId(recommendationTracks[0].id)}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            전체 재생
          </button>
          {member?.admin && <button className={'btn subtle recommendation-vote-btn' + (playlist.voteOpen ? ' active' : '')} onClick={onSettingsOpen} aria-label={playlist.voteOpen ? '진행 중인 투표 관리' : playlist.lastSelectedTrackIds?.length ? '선정곡 연결' : '투표 열기'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l2 2 4-4"/><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/></svg>
            <span>{playlist.voteOpen ? '투표 관리' : playlist.lastSelectedTrackIds?.length ? '선정곡 연결' : '투표 열기'}</span>
          </button>}
        </div>}
        {editMode && <p className="hint reorder-hint">곡을 눌러 제목·가수를 수정하거나 오른쪽 버튼으로 삭제할 수 있어요.</p>}
        <div className="list track-list">{recommendationTracks.map((track) => {
          const voted = member ? !!track.votes?.[member.uid] : false
          const votes = Object.values(track.votes || {}).filter(Boolean).length
          const selected = track.candidateStatus === 'selected'
          if (editMode) return <div key={track.id} className="track-row">
            <button className="track-link" onClick={() => onEditTrack(track)} aria-label={`${track.title || '곡'} 정보 수정`}>
              <div className="track-thumb sm"><img src={track.thumbnail || thumbnailUrl(track.videoId)} alt="" loading="lazy" /></div>
              <div className="track-info"><h3>{track.title || '(제목 없음)'}</h3>{track.artist && <p>{track.artist}</p>}</div>
              <span className="track-edit-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 20-3.5-3.5a2.1 2.1 0 0 1 0-3L14 3a2.1 2.1 0 0 1 3 0l4 4a2.1 2.1 0 0 1 0 3L11 20Z"/><path d="m10 7 7 7"/><path d="M7 20h14"/></svg></span>
            </button>
            <button className="edit-btn track-del" onClick={() => onDeleteTrack(track)} aria-label={`${track.title || '곡'} 삭제`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>
          return <div key={track.id} className={'setlist-row playlist-setlist-row card-play-target' + (track.id === playingId ? ' playing' : '') + (selected ? ' mine' : '')} role="button" tabIndex={0} onClick={() => setPlayingId(track.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPlayingId(track.id) } }}>
            <div className="setlist-rowhead">
              <button className="track-thumb-btn" onClick={(e) => { e.stopPropagation(); setPlayingId(track.id) }} aria-label="재생">
                <div className="track-thumb sm">
                  <img src={track.thumbnail || thumbnailUrl(track.videoId)} alt="" loading="lazy" />
                  <span className="track-play" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></span>
                </div>
              </button>
              <div className="setlist-body"><div className="track-info">
                <h3>{track.title || '(제목 없음)'}</h3>
                {track.artist && <p>{track.artist}</p>}
              </div></div>
              {!voteOpen && <span className="playlist-track-adder">{track.addedByName || '멤버'}</span>}
              {selected && <span className="track-mypart">선정</span>}
              {!selected && voteOpen && canVote && member && <div className="candidate-vote-action" onClick={(e) => e.stopPropagation()}><span>{votes}표</span><button disabled={busyId === track.id || (!voted && myVoteCount >= maxVotes)} className={'btn ' + (voted ? 'primary' : 'subtle')} aria-pressed={voted} onClick={() => void update(track, { [`votes.${member.uid}`]: !voted })}>{voted ? '선택 취소' : myVoteCount >= maxVotes ? `${maxVotes}곡 완료` : '곡 선택'}</button></div>}
            </div>
          </div>
        })}</div>
      </>}
    </main>
    <button className="fab" onClick={onAdd} disabled={voteOpen} title={voteOpen ? '투표가 끝난 뒤 추천곡을 추가할 수 있어요' : undefined}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      {voteOpen ? '투표 진행 중' : '곡 추가'}
    </button>
    {settingsOpen && member?.admin && <Sheet onClose={onSettingsClose}>
      <h2>{voteOpen ? '투표 관리' : hasSavedResults && !openingNewVote ? '선정곡 연결' : '추천곡 투표 열기'}</h2>
      {voteOpen && !editingVote ? <>
        <p className="hint">선정곡 {playlist.voteSelectionCount ?? 1}곡 · 지정 보컬 {Object.keys(playlist.voteVoterLimits ?? {}).length}명</p>
        <div className="vote-vocal-list">{vocalMembers.filter((vocal) => (playlist.voteVoterLimits?.[vocal.uid] ?? 0) > 0).map((vocal) => <div className="vote-vocal-row" key={vocal.uid}><strong>{vocal.name}</strong><span>최대 {playlist.voteVoterLimits?.[vocal.uid]}곡</span></div>)}</div>
        <div className="vote-manage-actions"><button className="btn subtle" onClick={() => setEditingVote(true)}>설정 수정</button><button className="btn danger" onClick={() => setCancelConfirm(true)}>투표 취소</button></div>
        <div className="actions"><button className="btn subtle" onClick={onSettingsClose}>닫기</button><button className="btn primary" disabled={!!busyId} onClick={() => void closeVote()}>투표 종료 및 선정</button></div>
      </> : hasSavedResults && !openingNewVote ? <>
        <div className="vote-vocal-list">{selectedResults.map((track) => <div className="vote-vocal-row" key={track.id}><strong>{track.title}</strong><span>{track.artist}</span></div>)}</div>
        <div className="field"><label>공연곡 재생목록</label><ThemeSelect value={targetPlaylistId} onChange={setTargetPlaylistId} title="공연곡 재생목록" placeholder="선택해 주세요" options={performancePlaylists.filter((item) => !playlist.voteLinkedPlaylistIds?.includes(item.id)).map((item) => ({ value: item.id, label: item.name }))} /></div>
        <div className="actions selected-link-actions"><button className="btn subtle" onClick={onSettingsClose}>닫기</button><button className="btn subtle" onClick={() => { setVoterLimits({}); setOpeningNewVote(true) }}>새 투표</button><button className="btn primary" disabled={!targetPlaylistId || !!busyId} onClick={() => void linkSelectedTracks()}>재생목록에 추가</button></div>
      </> : <>
        <section className="vote-setting-section">
          <div className="vote-setting-head"><span className="vote-setting-step">1</span><h3>투표할 보컬</h3></div>
          <label className="vote-select-all"><span><input type="checkbox" checked={allVocalsSelected} onChange={(e) => toggleAllVocals(e.target.checked)} /><b>전체 보컬</b></span><em>{vocalMembers.length}명</em></label>
          <div className="vote-vocal-grid">{vocalMembers.map((vocal) => {
            const enabled = (voterLimits[vocal.uid] ?? 0) > 0
            return <label className={'vote-vocal-choice' + (enabled ? ' selected' : '')} key={vocal.uid}>
              <input type="checkbox" checked={enabled} onChange={(e) => setVoterLimits((current) => ({ ...current, [vocal.uid]: e.target.checked ? selectionCount : 0 }))} />
              <span>{vocal.name}</span>
            </label>
          })}</div>
          {vocalMembers.length === 0 && <p className="setlist-empty">보컬 파트로 등록된 멤버가 없어요.</p>}
        </section>
        <section className="vote-setting-section">
          <div className="vote-setting-head"><span className="vote-setting-step">2</span><h3>1인당 선택 곡 수</h3></div>
          <div className="vote-count-control"><button type="button" onClick={() => changeSelectionCount(selectionCount - 1)} disabled={selectionCount <= 1} aria-label="한 곡 줄이기">−</button><strong>{selectionCount}</strong><span>곡</span><button type="button" onClick={() => changeSelectionCount(selectionCount + 1)} disabled={selectionCount >= Math.max(1, candidates.length)} aria-label="한 곡 늘리기">+</button></div>
        </section>
        <section className="vote-setting-section">
          <div className="vote-setting-head"><span className="vote-setting-step">3</span><h3>투표 마감일</h3></div>
          <div className="field recommendation-deadline-field"><input aria-label="추천곡 투표 마감일" type="date" value={voteDeadline} min={new Date().toLocaleDateString('sv-SE')} onChange={(e) => setVoteDeadline(e.target.value)} /></div>
        </section>
        <div className="actions"><button className="btn subtle" onClick={() => editingVote ? setEditingVote(false) : hasSavedResults ? setOpeningNewVote(false) : onSettingsClose()}>{editingVote || hasSavedResults ? '돌아가기' : '취소'}</button><button className="btn primary" disabled={!!busyId || candidates.length === 0 || selectedVocalIds.length === 0 || !voteDeadline} onClick={() => void (editingVote ? saveVoteChanges() : openVote())}>{editingVote ? '변경사항 저장' : <>투표 시작 <span>· {selectedVocalIds.length}명</span></>}</button></div>
      </>}
    </Sheet>}
    {cancelConfirm && <ConfirmDialog message="진행 중인 투표를 취소할까요? 지금까지의 표는 모두 삭제되고 곡은 선정되지 않아요." confirmLabel="투표 취소" cancelLabel="돌아가기" danger onConfirm={() => void cancelVote()} onCancel={() => setCancelConfirm(false)} />}
  </>
}
