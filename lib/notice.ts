/**
 * lib/notice.ts
 *
 * 공지사항 관련 Firestore 유틸 함수 모음.
 * 모든 화면에서 직접 Firestore 쿼리를 작성하는 대신 이 파일의 함수를 사용한다.
 */

import {
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
} from 'firebase/firestore';
import { getIdToken } from 'firebase/auth';
import { auth } from './firebase';
import { Collections } from './firestore';
import type { Notice, NoticeAttachment, User } from '../types/index';

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────

/** createNotice 호출 시 필요한 매개변수 */
export interface CreateNoticeParams {
  title: string;
  content: string;
  isImportant: boolean;
  academyId: string;
  createdBy: string;         // 작성자 uid
  targetClassIds: string[];  // 빈 배열 = 전체 반
  targetRoles: string[];     // 빈 배열 = 모두. 예: ['student'] | ['parent'] | []
  attachments?: NoticeAttachment[]; // 업로드 완료된 첨부파일 메타
}

// 업로드 전 로컬 파일 정보 (호출자가 채워서 uploadNoticeAttachment에 전달)
export interface PendingNoticeAttachment {
  uri: string;       // 로컬 파일 URI (file://...)
  name: string;      // 원본 파일명
  kind: 'image' | 'file';
  size: number;      // 바이트
  mime: string;      // MIME 타입
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
  const { title, content, isImportant, academyId, createdBy, targetClassIds, targetRoles, attachments } = params;

  const docRef = await addDoc(Collections.notices(), {
    title,
    content,
    is_important: isImportant,
    academy_id: academyId,
    created_by: createdBy,
    read_by: [],
    target_class_ids: targetClassIds,  // 빈 배열 = 전체 반
    target_roles: targetRoles,         // 빈 배열 = 모두 (학생+학부모)
    attachments: attachments ?? [],    // 첨부파일 메타 (없으면 빈 배열)
    created_at: serverTimestamp(),
  });

  return docRef.id;
}

// ─────────────────────────────────────────────────────────────
// 첨부파일 업로드 (Storage REST API + FormData)
// ─────────────────────────────────────────────────────────────

/**
 * 공지 첨부파일을 Firebase Storage에 업로드한다.
 * Hermes 엔진의 Blob 호환성 이슈 회피를 위해 REST API + FormData 사용.
 *
 * @param academyId  학원 ID — Storage 경로 + 보안 규칙에 사용
 * @param noticeTempId  사전 발급한 임시 noticeId (uuid 또는 timestamp)
 * @param file       업로드할 파일 정보
 * @returns          업로드된 파일 메타 (저장용 URL 포함)
 */
export async function uploadNoticeAttachment(
  academyId: string,
  noticeTempId: string,
  file: PendingNoticeAttachment,
): Promise<NoticeAttachment> {
  const token = auth.currentUser ? await getIdToken(auth.currentUser) : null;
  if (!token) throw new Error('인증 토큰 없음');

  const bucket = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET;
  // 동일 파일명 충돌 방지 — 타임스탬프 prefix
  const safeName = `${Date.now()}_${file.name.replace(/[^\w.\-]/g, '_')}`;
  const storagePath = `notices/${academyId}/${noticeTempId}/${safeName}`;
  const encodedPath = encodeURIComponent(storagePath);
  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?name=${encodedPath}`;

  const formData = new FormData();
  formData.append('file', {
    uri: file.uri,
    type: file.mime,
    name: safeName,
  } as any);

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`첨부파일 업로드 실패 (${res.status}): ${errText}`);
  }

  const json = await res.json();
  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${json.downloadTokens}`;

  return {
    url: downloadUrl,
    name: file.name,
    kind: file.kind,
    size: file.size,
    mime: file.mime,
  };
}

// ─────────────────────────────────────────────────────────────
// 공지 수정
// ─────────────────────────────────────────────────────────────

/**
 * 기존 공지의 제목 / 내용 / 중요 여부를 수정한다.
 */
export async function updateNotice(
  noticeId: string,
  params: { title: string; content: string; isImportant: boolean }
): Promise<void> {
  await updateDoc(Collections.notice(noticeId), {
    title: params.title,
    content: params.content,
    is_important: params.isImportant,
  });
}

// ─────────────────────────────────────────────────────────────
// 공지 삭제
// ─────────────────────────────────────────────────────────────

/**
 * 공지 문서를 Firestore에서 삭제한다.
 */
export async function deleteNotice(noticeId: string): Promise<void> {
  await deleteDoc(Collections.notice(noticeId));
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
 * @param viewerClassId - 학생 역할의 경우 본인 반 ID를 전달.
 *   전달 시 전체 공지(target_class_ids=[]) 또는 해당 반이 포함된 공지만 클라이언트 필터링.
 * @param viewerRole - 'student' 또는 'parent' 전달 시 역할 기반 필터링 적용.
 *   target_roles가 빈 배열(=모두) 이거나 해당 역할이 포함된 공지만 표시.
 * @returns 구독 해제 함수 (useEffect cleanup에서 반드시 호출)
 */
export function subscribeNotices(
  academyId: string,
  callback: (notices: Notice[]) => void,
  viewerClassId?: string | null,
  viewerRole?: string | null,
): () => void {
  const q = query(
    Collections.notices(),
    where('academy_id', '==', academyId),
    orderBy('is_important', 'desc'), // 중요 공지 상단
    orderBy('created_at', 'desc'),   // 최신순
  );

  const unsub = onSnapshot(q, (snap) => {
    let notices = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Notice));

    // 학생: 전체 공지(target_class_ids=[]) 또는 본인 반 포함 공지만 표시
    if (viewerClassId) {
      notices = notices.filter(
        (n) =>
          !n.target_class_ids ||
          n.target_class_ids.length === 0 ||
          n.target_class_ids.includes(viewerClassId)
      );
    }

    // 학생/학부모: target_roles가 빈 배열(=모두) 또는 본인 역할 포함 공지만 표시
    if (viewerRole === 'student' || viewerRole === 'parent') {
      notices = notices.filter(
        (n) =>
          !n.target_roles ||
          n.target_roles.length === 0 ||
          n.target_roles.includes(viewerRole)
      );
    }

    callback(notices);
  });

  return unsub;
}

// ─────────────────────────────────────────────────────────────
// 읽음 현황 조회 (Pro 전용 기능에서 사용)
// ─────────────────────────────────────────────────────────────

/**
 * 특정 공지의 읽음/미읽음 사용자 목록을 실시간으로 구독한다.
 * 학생/학부모가 공지를 읽으면 read_by가 업데이트되고 callback이 즉시 호출된다.
 *
 * 흐름:
 * 1) 학원 소속 학생+학부모 목록을 일회성으로 조회 (사용자 목록은 자주 바뀌지 않음)
 * 2) 공지 문서(read_by 필드)를 onSnapshot으로 실시간 감시
 * 3) read_by 변경 시 callback으로 readUsers/unreadUsers 반환
 *
 * @returns 구독 해제 함수 (useEffect cleanup에서 반드시 호출)
 */
export function subscribeNoticeReadUsers(
  noticeId: string,
  academyId: string,
  callback: (status: NoticeReadStatus) => void,
  onError?: (e: unknown) => void,
): () => void {
  let unsubNotice: (() => void) | null = null;
  let isCancelled = false;

  // 1) 학원 소속 학생+학부모 일회성 조회
  getDocs(
    query(
      Collections.users(),
      where('academy_id', '==', academyId),
      where('role', 'in', ['student', 'parent']),
      where('is_active', '==', true),
    )
  ).then((usersSnap) => {
    if (isCancelled) return;

    // 탈퇴 학생·학부모(deleted_at != null) 제외
    const allUsers = usersSnap.docs
      .map((d) => ({ uid: d.id, ...d.data() } as User))
      .filter((u) => !u.deleted_at);

    // 2) 공지 문서 실시간 구독 — read_by 변경 시마다 호출됨
    unsubNotice = onSnapshot(Collections.notice(noticeId), (snap) => {
      if (!snap.exists()) {
        callback({ readUsers: [], unreadUsers: [] });
        return;
      }

      const noticeData = snap.data() as Notice;
      const readBy: string[]        = noticeData.read_by          ?? [];
      const targetRoles: string[]   = noticeData.target_roles     ?? [];
      const targetClassIds: string[] = noticeData.target_class_ids ?? [];

      // target_roles 필터
      let filtered = [...allUsers];
      if (targetRoles.length > 0) {
        filtered = filtered.filter((u) => targetRoles.includes(u.role));
      }

      // target_class_ids 필터
      if (targetClassIds.length > 0) {
        const studentUidsInTarget = new Set(
          filtered
            .filter((u) => u.role === 'student' && targetClassIds.includes(u.class_id ?? ''))
            .map((u) => u.uid)
        );
        filtered = filtered.filter((u) => {
          if (u.role === 'student') return targetClassIds.includes(u.class_id ?? '');
          if (u.role === 'parent')  return u.children?.some((cid) => studentUidsInTarget.has(cid));
          return false;
        });
      }

      // read_by 기준으로 읽음/미읽음 분리
      const readSet = new Set(readBy);
      callback({
        readUsers:   filtered.filter((u) => readSet.has(u.uid)),
        unreadUsers: filtered.filter((u) => !readSet.has(u.uid)),
      });
    });
  }).catch((e) => {
    console.warn('[subscribeNoticeReadUsers] 사용자 조회 실패:', e);
    onError?.(e);
  });

  // 구독 해제 함수 반환
  return () => {
    isCancelled = true;
    unsubNotice?.();
  };
}

// ─────────────────────────────────────────────────────────────
// 읽음 현황 일회성 조회 (레거시 — 실시간이 필요없는 경우만 사용)
// ─────────────────────────────────────────────────────────────

/**
 * 특정 공지의 읽음/미읽음 사용자 목록을 반환한다.
 * 공지의 target_roles / target_class_ids를 반영해 실제 수신 대상자만 집계한다.
 * (선생님/admin 제외)
 */
export async function getNoticeReadUsers(
  noticeId: string,
  academyId: string
): Promise<NoticeReadStatus> {
  // 1) 공지 문서에서 read_by 배열 + 대상 설정 조회
  const noticeSnap = await getDoc(Collections.notice(noticeId));
  if (!noticeSnap.exists()) {
    return { readUsers: [], unreadUsers: [] };
  }
  const noticeData = noticeSnap.data() as Notice;
  const readBy: string[] = noticeData.read_by ?? [];
  const targetRoles: string[]    = noticeData.target_roles     ?? [];     // 빈 배열 = 모두
  const targetClassIds: string[] = noticeData.target_class_ids ?? [];     // 빈 배열 = 전체 반

  // 2) 해당 학원의 학생 + 학부모 전체 목록 조회
  const usersSnap = await getDocs(
    query(
      Collections.users(),
      where('academy_id', '==', academyId),
      where('role', 'in', ['student', 'parent']),
      where('is_active', '==', true),
    )
  );
  let allUsers = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() } as User));

  // 3) target_roles 필터 — 빈 배열이면 모두 포함
  if (targetRoles.length > 0) {
    allUsers = allUsers.filter((u) => targetRoles.includes(u.role));
  }

  // 4) target_class_ids 필터 — 빈 배열이면 전체 반 포함
  //    학생: class_id 직접 비교
  //    학부모: 자녀(children 배열)가 해당 반에 속하는지 확인
  if (targetClassIds.length > 0) {
    // 대상 반에 속한 학생 uid 세트를 미리 구성
    const studentUidsInTarget = new Set(
      allUsers
        .filter((u) => u.role === 'student' && targetClassIds.includes(u.class_id ?? ''))
        .map((u) => u.uid)
    );

    allUsers = allUsers.filter((u) => {
      if (u.role === 'student') return targetClassIds.includes(u.class_id ?? '');
      if (u.role === 'parent')  return u.children?.some((cid) => studentUidsInTarget.has(cid));
      return false;
    });
  }

  // 5) read_by 배열 기준으로 읽음/미읽음 분리
  const readSet = new Set(readBy);
  const readUsers   = allUsers.filter((u) => readSet.has(u.uid));
  const unreadUsers = allUsers.filter((u) => !readSet.has(u.uid));

  return { readUsers, unreadUsers };
}
