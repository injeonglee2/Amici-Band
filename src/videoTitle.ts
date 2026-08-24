export const MACHINE_LEARNING_TITLE_PREFIX = '[머신러닝+딥러닝 기초 강의]'

/** 특정 강의 재생목록이 모든 영상 제목 앞에 붙이는 공통 문구만 제거한다. */
export function cleanPersonalVideoTitle(title: string): string {
  return title
    .replaceAll(MACHINE_LEARNING_TITLE_PREFIX, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
