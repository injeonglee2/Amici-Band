/** 개인 채널 일정 유형 아이콘 검색용 큐레이션 이모지 목록. k = 검색 키워드(한/영). */
export interface EmojiItem {
  e: string
  k: string[]
}

export const EMOJI_LIST: EmojiItem[] = [
  // 운동·건강
  { e: '🏃', k: ['러닝', '달리기', '조깅', 'run', 'running', 'jog'] },
  { e: '🏋️', k: ['헬스', '운동', '웨이트', 'gym', 'workout', 'weight'] },
  { e: '🚴', k: ['자전거', '사이클', 'bike', 'cycling'] },
  { e: '🧘', k: ['요가', '명상', '스트레칭', 'yoga', 'meditation'] },
  { e: '⚽', k: ['축구', 'soccer', 'football', '공'] },
  { e: '🏀', k: ['농구', 'basketball'] },
  { e: '🏸', k: ['배드민턴', 'badminton'] },
  { e: '🎾', k: ['테니스', 'tennis'] },
  { e: '🏊', k: ['수영', 'swim'] },
  { e: '⛰️', k: ['등산', '하이킹', '산', 'hiking', 'mountain'] },
  { e: '💪', k: ['운동', '근육', 'muscle', 'strong'] },
  { e: '❤️', k: ['건강', '심장', 'health', 'heart'] },
  // 공부·일
  { e: '📚', k: ['공부', '독서', '책', 'study', 'book', 'read'] },
  { e: '✏️', k: ['공부', '메모', '연필', 'write', 'pencil'] },
  { e: '📖', k: ['독서', '책', 'reading', 'book'] },
  { e: '💻', k: ['코딩', '노트북', '개발', '작업', 'coding', 'work', 'laptop'] },
  { e: '🖥️', k: ['컴퓨터', '작업', 'computer', 'desktop'] },
  { e: '💼', k: ['일', '업무', '출근', 'work', 'business', 'job'] },
  { e: '📊', k: ['회의', '업무', '차트', 'meeting', 'chart', 'report'] },
  { e: '📈', k: ['업무', '성장', 'growth', 'chart'] },
  { e: '📝', k: ['시험', '메모', '작성', 'exam', 'note', 'test'] },
  { e: '🎓', k: ['졸업', '학교', '학위', 'graduate', 'school'] },
  { e: '🧑‍🏫', k: ['강의', '수업', '스터디', 'class', 'lecture'] },
  { e: '📅', k: ['일정', '캘린더', '약속', 'schedule', 'calendar'] },
  { e: '⏰', k: ['알람', '마감', '시간', 'alarm', 'deadline', 'time'] },
  { e: '📞', k: ['전화', '통화', '미팅', 'call', 'phone'] },
  { e: '✉️', k: ['메일', '편지', 'mail', 'email'] },
  // 모임·약속
  { e: '🍻', k: ['술', '모임', '회식', '맥주', 'drink', 'beer', 'party'] },
  { e: '🍽️', k: ['식사', '밥', '저녁', 'meal', 'dinner', 'food'] },
  { e: '☕', k: ['카페', '커피', '미팅', 'cafe', 'coffee'] },
  { e: '🎂', k: ['생일', '기념일', 'birthday', 'cake'] },
  { e: '🎉', k: ['파티', '축하', '기념', 'party', 'celebrate'] },
  { e: '🎁', k: ['선물', '기념일', 'gift', 'present'] },
  { e: '💐', k: ['기념일', '꽃', 'flower', 'anniversary'] },
  { e: '👥', k: ['모임', '미팅', '사람', 'group', 'meeting'] },
  { e: '🤝', k: ['미팅', '약속', '만남', 'meeting', 'deal'] },
  { e: '💬', k: ['대화', '회의', '수다', 'talk', 'chat'] },
  { e: '❤️‍🔥', k: ['데이트', '연애', 'date', 'love'] },
  // 취미·여가
  { e: '🎮', k: ['게임', 'game'] },
  { e: '🎬', k: ['영화', '극장', 'movie', 'film'] },
  { e: '🎵', k: ['음악', '노래', 'music', 'song'] },
  { e: '🎸', k: ['기타', '밴드', '합주', 'guitar', 'band'] },
  { e: '🎤', k: ['노래방', '공연', '보컬', 'karaoke', 'sing'] },
  { e: '🎨', k: ['그림', '미술', '취미', 'art', 'draw'] },
  { e: '📷', k: ['사진', '촬영', 'photo', 'camera'] },
  { e: '🎧', k: ['음악', '팟캐스트', 'music', 'podcast'] },
  { e: '🧩', k: ['취미', '퍼즐', 'hobby', 'puzzle'] },
  { e: '♟️', k: ['체스', '보드게임', 'chess', 'board'] },
  { e: '🎯', k: ['목표', '다트', 'goal', 'target'] },
  // 여행·이동
  { e: '✈️', k: ['여행', '비행기', 'travel', 'flight'] },
  { e: '🧳', k: ['여행', '출장', '가방', 'trip', 'luggage'] },
  { e: '🚗', k: ['드라이브', '차', '이동', 'car', 'drive'] },
  { e: '🚆', k: ['기차', '이동', 'train'] },
  { e: '🏖️', k: ['휴가', '바다', '여행', 'vacation', 'beach'] },
  { e: '🗺️', k: ['여행', '지도', 'map', 'travel'] },
  { e: '⛺', k: ['캠핑', 'camping'] },
  // 생활·집안일
  { e: '🛒', k: ['쇼핑', '장보기', 'shopping', 'grocery'] },
  { e: '🧹', k: ['청소', '집안일', 'clean', 'chore'] },
  { e: '🧺', k: ['빨래', '세탁', 'laundry'] },
  { e: '🍳', k: ['요리', '아침', 'cook', 'breakfast'] },
  { e: '🏥', k: ['병원', '진료', 'hospital', 'clinic'] },
  { e: '💊', k: ['약', '복용', 'medicine', 'pill'] },
  { e: '💇', k: ['미용실', '머리', 'haircut', 'salon'] },
  { e: '🏦', k: ['은행', '업무', 'bank'] },
  { e: '🐶', k: ['강아지', '산책', '반려동물', 'dog', 'pet', 'walk'] },
  { e: '🐱', k: ['고양이', '반려동물', 'cat', 'pet'] },
  { e: '🌱', k: ['식물', '가드닝', 'plant', 'garden'] },
  // 기타·상태
  { e: '📌', k: ['핀', '중요', '기본', 'pin', 'default'] },
  { e: '⭐', k: ['중요', '별', 'star', 'important'] },
  { e: '🔥', k: ['중요', '열정', 'fire', 'hot'] },
  { e: '✅', k: ['완료', '체크', 'done', 'check'] },
  { e: '🌙', k: ['밤', '야간', 'night', 'moon'] },
  { e: '☀️', k: ['아침', '낮', 'morning', 'sun'] },
  { e: '💡', k: ['아이디어', '기획', 'idea'] },
  { e: '💰', k: ['돈', '재정', 'money', 'finance'] },
  { e: '🙏', k: ['기도', '부탁', '감사', 'pray', 'thanks'] },
  { e: '🩺', k: ['건강검진', '진료', 'checkup', 'doctor'] },
]

export function searchEmoji(query: string): EmojiItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return EMOJI_LIST
  return EMOJI_LIST.filter((item) => item.e === q || item.k.some((kw) => kw.toLowerCase().includes(q)))
}
