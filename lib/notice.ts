/**
 * lib/notice.ts
 *
 * 공지사항 관련 Firestore 유틸 함수 모음.
 * 모든 화면에서 직접 Firestore 쿼리를 작성하는 대신 이 파일의 함수를 사용한다.
 */

import {
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
} from 'firebase/firestore';
import { Collections } from './firestore';
import type { Notice, User } from '../types/index';

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────

/** createNotice 호출 시 필요한 매개변수 */
export interface CreateNoticeParams {
  title: string;
  content: string;
  isImportant: boolean;
  academyId: string;
  createdBy: string; // 작성자 uid
}

/** getNoticeReadUsers 반환 타입 */
export interface NoticeReadStatus {
  readUsers: User[];   // 읽은 사용자 목록
  unreadUsers: User[]; // 아직 읽지 않은 사용자 목록
}

// ─────────────────────────────────────────────────────────────
// 공지 생성
// ─────────────────────────────────────────────────────────────

/**
 * 새 공지를 Firestore notices 컬렉션에 저장한다.
 * @returns 생성된 문서 ID
 */
export async function createNotice(params: CreateNoticeParams): Promise<string> {
  const { title, content, isImportant, academyId, createdBy } = params;

  const docRef = await addDoc(Collections.notices(), {
    title,
    content,
    is_important: isImportant,
    academy_id: academyId,
    created_by: createdBy,
    read_by: [],           // 초기 읽음 목록은 빈 배열
    created_at: serverTimestamp(),
  });

  return docRef.id;
}

// ─────────────────────────────────────────────────────────────
// 읽음 처리
// ─────────────────────────────────────────────────────────────

/**
 * 공지 상세 진입 시 호출. read_by 배열에 uid를 추가한다.
 * arrayUnion을 사용하므로 중복 추가되지 않는다.
 */
export async function markNoticeRead(noticeId: string, uid: string): Promise<void> {
  await updateDoc(Collections.notice(noticeId), {
    read_by: arrayUnion(uid),
  });
}

// ─────────────────────────────────────────────────────────────
// 실시간 목록 구독
// ─────────────────────────────────────────────────────────────

/**
 * 특정 학원의 공지 목록을 실시간으로 구독한다.
 * 중요 공지 → 최신순으로 정렬.
 *
 * @returns 구독 해제 함수 (useEffect cleanup에서 반드시 호출)
 */
export function subscribeNotices(
  academyId: string,
  callback: (notices: Notice[]) => void
): () => void {
  const q = query(
    Collections.notices(),
    where('academy_id', '==', academyId),
    orderBy('is_important', 'desc'), // 중요 공지 상단
    orderBy('created_at', 'desc'),   // 최신순
  );

  const unsub = onSnapshot(q, (snap) => {
    const notices = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Notice));
    callback(notices);
  });

  return unsub;
}

// ─────────────────────────────────────────────────────────────
// 읽음 현황 조회 (Pro 전용 기능에서 사용)
// ─────────────────────────────────────────────────────────────

/**
 * 특정 공지의 읽음/미읽음 사용자 목록을 반환한다.
 * 학생 + 학부모 역할을 대상으로 집계 (선생님/admin 제외).
 */
export async function getNoticeReadUsers(
  noticeId: string,
  academyId: string
): Promise<NoticeReadStatus> {
  // 1) 공지 문서에서 read_by 배열 조회
  const noticeSnap = await getDoc(Collections.notice(noticeId));
  if (!noticeSnap.exists()) {
    return { readUsers: [], unreadUsers: [] };
  }
  const readBy: string[] = noticeSnap.data().read_by ?? [];

  // 2) 해당 학원의 학생 + 학부모 전체 목록 조회
  const usersSnap = await getDocs(
    query(
      Collections.users(),
      where('academy_id', '==', academyId),
      where('role', 'in', ['student', 'parent']),
      where('is_active', '==', true),
    )
  );
  const allUsers = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() } as User));

  // 3) read_by 배열 기준으로 읽음/미읽음 분리
  const readSet = new Set(readBy);
  const readUsers = allUsers.filter((u) => readSet.has(u.uid));
  const unreadUsers = allUsers.filter((u) => !readSet.has(u.uid));

  return { readUsers, unreadUsers };
}
