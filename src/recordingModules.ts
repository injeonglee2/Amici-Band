import type { Recording } from './types'

export type RecordingSortId = 'newest-date' | 'oldest-date' | 'newest-added' | 'oldest-added' | 'manual'
export type RecordingGrouping =
  | { type: 'date' }
  | { type: 'none' }
  | { type: 'folder'; folderField: 'folderId' }

export interface RecordingModuleConfig {
  id: 'band-recordings' | 'personal-library'
  labels: {
    item: string
    empty: string
    add: string
    noResults: string
  }
  grouping: RecordingGrouping
  sort: {
    default: RecordingSortId
    options: { id: RecordingSortId; label: string }[]
  }
  capabilities: {
    musicFilter: boolean
    memberFilter: boolean
    managedFolders: boolean
  }
}

export const BAND_RECORDING_MODULE: RecordingModuleConfig = {
  id: 'band-recordings',
  labels: {
    item: '기록',
    empty: '기록이 없어요.',
    add: '기록 추가',
    noResults: '이 조건의 기록이 없어요.',
  },
  grouping: { type: 'date' },
  sort: {
    default: 'newest-date',
    options: [
      { id: 'newest-date', label: '최신순' },
      { id: 'oldest-date', label: '오래된순' },
    ],
  },
  capabilities: { musicFilter: true, memberFilter: true, managedFolders: false },
}

/** 다음 단계용 개인 기록 모듈 프리셋. 폴더 CRUD 연결 전까지 화면에는 노출하지 않는다. */
export const PERSONAL_RECORDING_MODULE: RecordingModuleConfig = {
  id: 'personal-library',
  labels: {
    item: '영상',
    empty: '모아둔 영상이 없어요.',
    add: '영상 추가',
    noResults: '이 폴더에 영상이 없어요.',
  },
  grouping: { type: 'folder', folderField: 'folderId' },
  sort: {
    default: 'manual',
    options: [
      { id: 'manual', label: '직접 정렬' },
      { id: 'newest-added', label: '최근 추가순' },
      { id: 'oldest-added', label: '먼저 추가순' },
    ],
  },
  capabilities: { musicFilter: false, memberFilter: false, managedFolders: true },
}

export function compareRecordings(sort: RecordingSortId) {
  return (a: Recording, b: Recording): number => {
    if (sort === 'manual') return (a.order ?? a.createdAt) - (b.order ?? b.createdAt)
    if (sort === 'newest-added') return b.createdAt - a.createdAt
    if (sort === 'oldest-added') return a.createdAt - b.createdAt
    const date = a.date === b.date ? a.createdAt - b.createdAt : a.date.localeCompare(b.date)
    return sort === 'newest-date' ? -date : date
  }
}
