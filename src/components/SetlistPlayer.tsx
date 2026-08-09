import { useEffect, useRef } from 'react'
import type { Track } from '../types'
import { loadYouTubeIframeApi, watchUrl } from '../youtube'

/**
 * 앱 내 유튜브 재생기 — 재생목록 상세에서 현재 곡을 임베드로 재생한다.
 * 곡이 끝나면 onEnded 로 부모가 다음 곡으로 넘겨 연속재생을 만든다.
 */
export default function SetlistPlayer({
  track,
  index,
  total,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onEnded,
  onClose,
}: {
  track: Track
  index: number
  total: number
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
  onEnded: () => void
  onClose: () => void
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const readyRef = useRef(false)
  const videoRef = useRef(track.videoId)

  // 최신 콜백을 ref 로 유지 (플레이어는 한 번만 생성하므로 클로저 고정 방지)
  const onEndedRef = useRef(onEnded)
  const onNextRef = useRef(onNext)
  onEndedRef.current = onEnded
  onNextRef.current = onNext

  // 플레이어 1회 생성
  useEffect(() => {
    let cancelled = false
    loadYouTubeIframeApi().then(() => {
      if (cancelled || !mountRef.current || playerRef.current || !window.YT) return
      playerRef.current = new window.YT.Player(mountRef.current, {
        videoId: videoRef.current,
        playerVars: {
          autoplay: 1,
          playsinline: 1, // iOS 에서 전체화면 강제 방지
          rel: 0,
          modestbranding: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            readyRef.current = true
          },
          onStateChange: (e: { data: number }) => {
            if (window.YT && e.data === window.YT.PlayerState.ENDED) onEndedRef.current()
          },
          // 임베드 불가·오류 영상은 다음 곡으로 건너뛴다
          onError: () => onNextRef.current(),
        },
      })
    })
    return () => {
      cancelled = true
      if (playerRef.current) {
        try {
          playerRef.current.destroy()
        } catch {
          /* 이미 제거됨 */
        }
        playerRef.current = null
        readyRef.current = false
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 곡이 바뀌면 영상 교체
  useEffect(() => {
    if (track.videoId === videoRef.current) return
    videoRef.current = track.videoId
    const p = playerRef.current
    if (p && readyRef.current) p.loadVideoById(track.videoId)
  }, [track.videoId])

  return (
    <div className="player">
      <div className="player-video">
        <div ref={mountRef} />
      </div>
      <div className="player-bar">
        <button className="player-ctrl" onClick={onPrev} disabled={!hasPrev} aria-label="이전 곡">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
        </button>
        <div className="player-now">
          <b>{track.title || '(제목 없음)'}</b>
          <span>
            {track.artist ? `${track.artist} · ` : ''}
            {index + 1} / {total}
          </span>
        </div>
        <button className="player-ctrl" onClick={onNext} disabled={!hasNext} aria-label="다음 곡">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z" /></svg>
        </button>
        <a
          className="player-ctrl"
          href={track.url || watchUrl(track.videoId)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="유튜브에서 열기"
          title="유튜브에서 열기"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
        </a>
        <button className="player-ctrl" onClick={onClose} aria-label="재생기 닫기">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  )
}
