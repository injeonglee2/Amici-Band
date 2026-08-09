// vite.config.ts 의 define 으로 주입되는 전역 상수
declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string

// 유튜브 IFrame Player API (앱 내 재생용). @types/youtube 대신 최소 선언만 사용.
interface Window {
  YT?: {
    Player: new (el: HTMLElement | string, opts: unknown) => YTPlayer
    PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number }
  }
  onYouTubeIframeAPIReady?: () => void
}

interface YTPlayer {
  loadVideoById: (id: string) => void
  playVideo: () => void
  pauseVideo: () => void
  destroy: () => void
}
