import type { ReactNode } from 'react'

/** 음악 곡 목록과 같은 가로형 미디어 행. 썸네일·제목·보조문구·우측 동작만 담당한다. */
export default function MediaListRow({ thumbnail, title, subtitle, onOpen, trailing, playIcon = true }: {
  thumbnail?: string
  title: string
  subtitle?: string
  onOpen: () => void
  trailing?: ReactNode
  playIcon?: boolean
}) {
  return (
    <article className="media-list-row">
      <button type="button" className="media-list-open" onClick={onOpen}>
        <span className="media-list-thumb">
          {thumbnail ? <img src={thumbnail} alt="" loading="lazy" /> : <span className="media-list-thumb-empty" />}
          {playIcon && <span className="media-list-play" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></span>}
        </span>
        <span className="media-list-info">
          <strong>{title}</strong>
          {subtitle && <small>{subtitle}</small>}
        </span>
      </button>
      {trailing && <span className="media-list-trailing">{trailing}</span>}
    </article>
  )
}
