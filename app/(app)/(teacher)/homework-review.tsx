/**
 * app/(app)/(teacher)/homework-review.tsx — 선생님 숙제 검사·피드백 화면
 *
 * 진입: homework.tsx 카드 탭 → hwId params 전달
 * 기능:
 *   - 제출자 목록: 썸네일 + 지각 칩 + 👍/💧 피드백 버튼
 *   - 미제출자 목록: 반투명(opacity 0.45)으로 표시
 *   - 제출 현황 프로그레스바
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Pressable,
  FlatList,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { firebase as fbFunctions } from '@react-native-firebase/functions';
import { Ionicons } from '@expo/vector-icons';
import { Collections } from '../../../lib/firestore';
import { useAuthStore } from '../../../store/useAuthStore';
import FeedbackButton from '../../../components/FeedbackButton';
import { Homework, Submission, User } from '../../../types';

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface SubmissionWithStudent extends Submission {
  studentUid: string;
  studentName: string;
  studentSchool?: string;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function HomeworkReviewScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const { hwId } = useLocalSearchParams<{ hwId: string }>();
  const { user } = useAuthStore();

  // 숙제 정보
  const [homework, setHomework] = useState<Homework | null>(null);
  // 반 학생 목록 (전원)
  const [students, setStudents] = useState<User[]>([]);
  // 제출물 목록 (실시간)
  const [submissions, setSubmissions] = useState<SubmissionWithStudent[]>([]);
  // 로딩 상태
  const [isLoading, setIsLoading] = useState(true);

  // 이미지 전체보기 모달
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewVisible, setPreviewVisible] = useState(false);

  // 알림 발송 중인 학생 uid 집합 (버튼 로딩 상태 관리)
  const [sendingUids, setSendingUids] = useState<Set<string>>(new Set());

  // ── 숙제 + 학생 목록 1회 로드 ────────────────────────────────────────────
  useEffect(() => {
    if (!hwId || !user?.academy_id) return;

    (async () => {
      try {
        // 1단계: 숙제 문서 조회
        const hwSnap = await Collections.homework(hwId).get();
        if (!hwSnap.exists()) {
          setIsLoading(false);
          return;
        }
        const hw = { id: hwSnap.id, ...hwSnap.data() } as Homework;
        setHomework(hw);

        // 2단계: 해당 반 학생 목록 조회
        // ★ 반드시 academy_id 조건을 함께 사용해야 Firestore 보안 규칙 통과
        //   (isAcademyMember 검증을 위해 academy_id를 쿼리에 명시)
        const studentSnap = await Collections.users()
          .where('academy_id', '==', user.academy_id)
          .where('class_id', '==', hw.class_id)
          .get();
        const studentList = studentSnap.docs
          .map(d => ({ uid: d.id, ...d.data() } as User))
          .filter(u => u.role === 'student' && u.is_active && !u.deleted_at);
        setStudents(studentList);

        // 학생이 없으면 로딩 즉시 해제
        if (studentList.length === 0) setIsLoading(false);
      } catch (e) {
        console.error('[HomeworkReview] 초기 데이터 로드 실패:', e);
        setIsLoading(false);
      }
    })();
  }, [hwId, user?.academy_id]);

  // ── 제출물 실시간 구독 ────────────────────────────────────────────────────
  useEffect(() => {
    if (!hwId || students.length === 0) return;

    // 학생 이름·학교 맵 (uid → name/school) 미리 생성
    const nameMap: Record<string, string> = {};
    const schoolMap: Record<string, string> = {};
    students.forEach(s => {
      nameMap[s.uid] = s.name;
      if (s.school_name) schoolMap[s.uid] = s.school_name;
    });

    const unsub = Collections.submissions(hwId).onSnapshot(
      (snap) => {
        const list = snap.docs.map(d => ({
          studentUid: d.id,
          studentName: nameMap[d.id] ?? '알 수 없음',
          studentSchool: schoolMap[d.id],
          ...d.data(),
        } as SubmissionWithStudent));

        // 제출 시간 기준 정렬 (최신 제출 우선)
        list.sort((a, b) =>
          (b.submitted_at?.toMillis() ?? 0) - (a.submitted_at?.toMillis() ?? 0)
        );

        setSubmissions(list);
        setIsLoading(false);
      },
      (e) => {
        console.error('[HomeworkReview] 제출물 구독 실패:', e);
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [hwId, students]);


  // ── 미제출 학생에게 숙제 알림 발송 ──────────────────────────────────────────
  const sendReminder = useCallback(async (studentUid: string) => {
    if (!hwId) return;
    setSendingUids((prev) => new Set(prev).add(studentUid));
    try {
      // CF region: asia-northeast3 (서울) — 전역 옵션 통일
      const fn = fbFunctions.app().functions('asia-northeast3').httpsCallable('sendHomeworkReminderPush');
      await fn({ hwId, studentUid });
    } catch (e) {
      console.error('[HomeworkReview] 알림 발송 실패:', e);
    } finally {
      setSendingUids((prev) => {
        const next = new Set(prev);
        next.delete(studentUid);
        return next;
      });
    }
  }, [hwId]);

  // ── 피드백 저장 ───────────────────────────────────────────────────────────
  const saveFeedback = useCallback(async (
    studentUid: string,
    feedback: '👍' | '💧',
    currentFeedback: '👍' | '💧' | null,
  ) => {
    if (!hwId) return;
    try {
      // 같은 피드백 재탭 시 → 피드백 초기화(null)로 되돌리기
      const newFeedback = currentFeedback === feedback ? null : feedback;
      await Collections.submission(hwId, studentUid).update({
        feedback: newFeedback,
        status: newFeedback ? 'checked' : 'submitted',
        // 피드백 취소 또는 👍로 변경 시 기존 코멘트도 초기화
        ...(newFeedback !== '💧' && { feedback_comment: '' }),
      });
    } catch (e) {
      console.error('[HomeworkReview] 피드백 저장 실패:', e);
    }
  }, [hwId]);

  // ── 💧 코멘트 저장 ────────────────────────────────────────────────────────
  const saveComment = useCallback(async (
    studentUid: string,
    comment: string,
  ) => {
    if (!hwId) return;
    await Collections.submission(hwId, studentUid).update({
      feedback_comment: comment.trim(),
    });
  }, [hwId]);

  // ── 파생 데이터 ───────────────────────────────────────────────────────────
  // 제출한 학생 uid 집합
  const submittedUids = new Set(submissions.map(s => s.studentUid));
  // 미제출자 목록
  const nonSubmitters = students.filter(s => !submittedUids.has(s.uid));
  // 제출률
  const submitRatio = students.length > 0 ? submissions.length / students.length : 0;

  // ── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={[styles.header, { paddingTop: top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {homework?.title ?? '숙제 검사'}
          </Text>
          {homework && (
            <Text style={styles.headerSub}>
              마감 {(homework.due_date as any).toDate().toLocaleDateString('ko-KR')}
            </Text>
          )}
        </View>
      </View>

      {/* 로딩 */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#5B50E8" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* 숙제 내용 카드 — content가 있을 때만 표시 */}
          {!!homework?.content && (
            <View style={styles.contentCard}>
              <Text style={styles.contentLabel}>숙제 내용</Text>
              <Text style={styles.contentText}>{homework.content}</Text>
            </View>
          )}

          {/* 제출 현황 카드 */}
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>제출 현황</Text>
              <Text style={styles.statusCount}>
                <Text style={styles.statusCountHighlight}>{submissions.length}</Text>
                {' / '}
                {students.length}명
              </Text>
            </View>
            {/* 프로그레스바 */}
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${submitRatio * 100}%` as any }]} />
            </View>
            {/* 검사 완료 / 다시풀기 요청 분리 표시 — 선생님이 후속 조치가 필요한 학생을 한눈에 식별 */}
            <Text style={styles.checkedLabel}>
              검사 완료 {submissions.filter(s => s.status === 'checked' && s.feedback === '👍').length}명
              {submissions.filter(s => s.status === 'checked' && s.feedback === '💧').length > 0 &&
                ` · 다시풀기 요청 ${submissions.filter(s => s.status === 'checked' && s.feedback === '💧').length}명`}
            </Text>
          </View>

          {/* 제출자 목록 */}
          {submissions.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>제출자 ({submissions.length}명)</Text>
              {submissions.map((sub) => (
                <SubmissionCard
                  key={sub.studentUid}
                  submission={sub}
                  onFeedback={(fb) => saveFeedback(sub.studentUid, fb, sub.feedback)}
                  onSaveComment={(comment) => saveComment(sub.studentUid, comment)}
                  onImagePress={(imgs, idx) => {
                    setPreviewImages(imgs);
                    setPreviewIndex(idx);
                    setPreviewVisible(true);
                  }}
                />
              ))}
            </View>
          )}

          {/* 미제출자 목록 */}
          {nonSubmitters.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>미제출 ({nonSubmitters.length}명)</Text>
              <View style={styles.nonSubmitCard}>
                {nonSubmitters.map((s, idx) => (
                  <View key={s.uid}>
                    <View style={styles.nonSubmitRow}>
                      <View style={styles.nonSubmitAvatar}>
                        <Text style={styles.nonSubmitAvatarText}>{s.name.charAt(0)}</Text>
                      </View>
                      <View style={styles.nonSubmitNameBlock}>
                        <Text style={styles.nonSubmitName}>{s.name}</Text>
                        {!!s.school_name && (
                          <Text style={styles.nonSubmitSchool}>{s.school_name}</Text>
                        )}
                      </View>
                      {/* 알림 보내기 버튼 */}
                      <TouchableOpacity
                        style={[
                          styles.reminderBtn,
                          sendingUids.has(s.uid) && styles.reminderBtnSending,
                        ]}
                        onPress={() => sendReminder(s.uid)}
                        disabled={sendingUids.has(s.uid)}
                        activeOpacity={0.7}
                      >
                        {sendingUids.has(s.uid) ? (
                          <ActivityIndicator size="small" color="#5B50E8" />
                        ) : (
                          <>
                            <Ionicons name="notifications-outline" size={13} color="#5B50E8" />
                            <Text style={styles.reminderBtnText}>알림</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                    {/* 마지막 아이템이 아니면 구분선 */}
                    {idx < nonSubmitters.length - 1 && (
                      <View style={styles.dividerLine} />
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 제출자도 미제출자도 없는 경우 */}
          {submissions.length === 0 && students.length === 0 && (
            <View style={styles.center}>
              <Text style={styles.emptyEmoji}>📭</Text>
              <Text style={styles.emptyText}>반 학생 데이터가 없어요</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* 이미지 전체보기 모달 */}
      <ImagePreviewModal
        visible={previewVisible}
        images={previewImages}
        initialIndex={previewIndex}
        onClose={() => setPreviewVisible(false)}
      />
    </View>
  );
}

// ── 제출물 카드 컴포넌트 ───────────────────────────────────────────────────────

interface SubmissionCardProps {
  submission: SubmissionWithStudent;
  onFeedback: (fb: '👍' | '💧') => void;
  onSaveComment: (comment: string) => Promise<void>;
  onImagePress: (images: string[], index: number) => void;
}

function SubmissionCard({ submission, onFeedback, onSaveComment, onImagePress }: SubmissionCardProps) {
  const { studentName, studentSchool, image_urls, is_late, feedback, feedback_comment, submitted_at, is_retry } = submission;

  // 💧 코멘트 입력 상태 — 현재 저장된 코멘트로 초기화
  const [commentText, setCommentText] = useState(feedback_comment ?? '');
  const [isSaving, setIsSaving] = useState(false);

  // 외부에서 feedback_comment가 바뀌면(Firestore 실시간 반영) 입력값 동기화
  useEffect(() => {
    setCommentText(feedback_comment ?? '');
  }, [feedback_comment]);

  // 제출 시각 포맷
  const submittedAt = submitted_at
    ? submitted_at.toDate().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  const handleSaveComment = async () => {
    setIsSaving(true);
    try {
      await onSaveComment(commentText);
    } finally {
      setIsSaving(false);
    }
  };

  // 저장된 코멘트와 현재 입력값이 같으면 저장 불필요
  const isCommentChanged = commentText.trim() !== (feedback_comment ?? '').trim();

  // 검사 완료 상태 분기
  // - 👍 + checked: 검사 완료(초록)
  // - 💧 + checked: 다시풀기 요청 — 학생이 다시 풀고 있는 중(주황 강조)
  const isReviewedOk = submission.status === 'checked' && feedback === '👍';
  const isRetryRequested = submission.status === 'checked' && feedback === '💧';

  return (
    <View
      style={[
        styles.submissionCard,
        isReviewedOk && styles.submissionCardChecked,
        // 선생님이 다시풀기 요청한 상태 → 학생이 다시 풀고 있는 중임을 강조
        isRetryRequested && styles.submissionCardRetryRequested,
        // 학생이 다시 제출한 + 검사 전 → 카드 전체 노란색 강조 (선생님이 한눈에 식별)
        is_retry && submission.status === 'submitted' && styles.submissionCardRetry,
      ]}
    >
      {/* 다시제출 강조 배너 — 검사 전인 재제출만 표시 */}
      {is_retry && submission.status === 'submitted' && (
        <View style={styles.retryBanner}>
          <Ionicons name="refresh" size={14} color="#92400E" />
          <Text style={styles.retryBannerText}>다시 제출했어요 — 새로 검사해주세요</Text>
        </View>
      )}

      {/* 상단: 학생 정보 */}
      <View style={styles.submissionTop}>
        <View style={styles.submissionAvatar}>
          <Text style={styles.submissionAvatarText}>{studentName.charAt(0)}</Text>
        </View>
        <View style={styles.submissionInfo}>
          <View style={styles.submissionNameRow}>
            <Text style={styles.submissionName}>{studentName}</Text>
            {!!studentSchool && (
              <Text style={styles.submissionSchool}>{studentSchool}</Text>
            )}
            {is_late && (
              <View style={styles.lateChip}>
                <Text style={styles.lateChipText}>지각</Text>
              </View>
            )}
            {/* 다시 제출 칩 — 검사 전이든 후든 학생이 한 번이라도 재제출 했으면 표시 */}
            {is_retry && (
              <View style={styles.retryChip}>
                <Text style={styles.retryChipText}>다시제출</Text>
              </View>
            )}
            {/* 검사완료(👍) — 초록 / 다시풀기 요청(💧) — 주황으로 분기 */}
            {isReviewedOk && (
              <View style={styles.checkedChip}>
                <Text style={styles.checkedChipText}>검사완료</Text>
              </View>
            )}
            {isRetryRequested && (
              <View style={styles.retryRequestChip}>
                <Text style={styles.retryRequestChipText}>다시풀기 요청</Text>
              </View>
            )}
          </View>
          <Text style={styles.submittedAt}>{submittedAt}</Text>
        </View>
      </View>

      {/* 이미지 썸네일 */}
      {image_urls.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.thumbnailScroll}
          contentContainerStyle={styles.thumbnailRow}
        >
          {image_urls.map((url, idx) => (
            <TouchableOpacity
              key={idx}
              activeOpacity={0.85}
              onPress={() => onImagePress(image_urls, idx)}
            >
              <Image source={{ uri: url }} style={styles.thumbnail} resizeMode="cover" />
              {idx === 0 && image_urls.length > 1 && (
                <View style={styles.imageCountBadge}>
                  <Text style={styles.imageCountText}>{image_urls.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* 피드백 버튼 — FeedbackButton 공용 컴포넌트 사용 */}
      <View style={styles.feedbackRow}>
        <FeedbackButton
          type="👍"
          selected={feedback === '👍'}
          onPress={() => onFeedback('👍')}
        />
        <FeedbackButton
          type="💧"
          selected={feedback === '💧'}
          onPress={() => onFeedback('💧')}
        />
      </View>

      {/* 💧 선택 시 코멘트 입력란 */}
      {feedback === '💧' && (
        <View style={styles.commentArea}>
          <TextInput
            style={styles.commentInput}
            value={commentText}
            onChangeText={setCommentText}
            placeholder="학생에게 전달할 피드백을 입력하세요 (선택)"
            placeholderTextColor="#94A3B8"
            multiline
            maxLength={200}
          />
          {/* 입력값이 바뀌었을 때만 저장 버튼 활성화 */}
          <TouchableOpacity
            style={[styles.commentSaveBtn, !isCommentChanged && styles.commentSaveBtnOff]}
            disabled={!isCommentChanged || isSaving}
            onPress={handleSaveComment}
            activeOpacity={0.8}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.commentSaveBtnText}>저장</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── 이미지 전체보기 모달 ────────────────────────────────────────────────────────

interface ImagePreviewModalProps {
  visible: boolean;
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

function ImagePreviewModal({ visible, images, initialIndex, onClose }: ImagePreviewModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // 모달 열릴 때마다 초기 인덱스 동기화
  useEffect(() => {
    if (visible) setCurrentIndex(initialIndex);
  }, [visible, initialIndex]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.previewOverlay}>
        {/* 닫기 버튼 */}
        <TouchableOpacity style={styles.previewCloseBtn} onPress={onClose} activeOpacity={0.8}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>

        {/* 페이지 표시 */}
        <Text style={styles.previewPageIndicator}>
          {currentIndex + 1} / {images.length}
        </Text>

        {/* 이미지 스와이프 */}
        <FlatList
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({
            length: 375, // 고정 너비 (스크롤용)
            offset: 375 * index,
            index,
          })}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / 375);
            setCurrentIndex(idx);
          }}
          renderItem={({ item }) => (
            <Pressable style={styles.previewImageWrapper} onPress={onClose}>
              <Image
                source={{ uri: item }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            </Pressable>
          )}
          keyExtractor={(_, i) => String(i)}
        />
      </View>
    </Modal>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  // ── 헤더
  header: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: '#64748B', marginTop: 2 },

  // ── 로딩 / 빈 화면
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { fontSize: 16, color: '#64748B', fontWeight: '600' },

  // ── 스크롤 콘텐츠
  scrollContent: { padding: 16, gap: 16, paddingBottom: 40 },

  // ── 숙제 내용 카드
  contentCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
    gap: 6,
  },
  contentLabel: { fontSize: 12, fontWeight: '700', color: '#94A3B8' },
  contentText: { fontSize: 15, color: '#0F172A', lineHeight: 22 },

  // ── 제출 현황 카드
  statusCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusLabel: { fontSize: 14, fontWeight: '700', color: '#475569' },
  statusCount: { fontSize: 15, color: '#64748B' },
  statusCountHighlight: { fontSize: 22, fontWeight: '800', color: '#5B50E8' },
  progressTrack: { height: 8, backgroundColor: '#E2E8F0', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#5B50E8', borderRadius: 4 },
  checkedLabel: { fontSize: 13, color: '#64748B' },

  // ── 섹션
  section: { gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#475569', paddingLeft: 2 },

  // ── 제출물 카드
  submissionCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  submissionCardChecked: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  // 다시 제출 + 검사 전 → 노란색 강조
  submissionCardRetry: {
    borderColor: '#FCD34D',
    borderWidth: 2,
    backgroundColor: '#FFFBEB',
  },
  // 다시 제출 안내 배너 (카드 최상단)
  retryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  retryBannerText: { fontSize: 13, fontWeight: '700', color: '#92400E' },
  // 다시제출 칩 (이름 옆)
  retryChip: {
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  retryChipText: { fontSize: 11, fontWeight: '700', color: '#92400E' },
  submissionTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  submissionAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#5B50E8',
    alignItems: 'center', justifyContent: 'center',
  },
  submissionAvatarText: { fontSize: 17, fontWeight: '800', color: '#fff' },
  submissionInfo: { flex: 1, gap: 3 },
  submissionNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  submissionName: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  submissionSchool: { fontSize: 11, color: '#94A3B8' },
  submittedAt: { fontSize: 12, color: '#94A3B8' },

  // 지각 칩
  lateChip: {
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  lateChipText: { fontSize: 11, fontWeight: '700', color: '#991B1B' },

  // 검사 완료 칩 (👍)
  checkedChip: {
    backgroundColor: '#ECFDF5',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  checkedChipText: { fontSize: 11, fontWeight: '700', color: '#065F46' },

  // 다시풀기 요청 칩 (💧 + 검사 완료) — 학생이 다시 풀고 있는 중
  retryRequestChip: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  retryRequestChipText: { fontSize: 11, fontWeight: '700', color: '#92400E' },

  // 다시풀기 요청 카드 배경 — 검사 완료(초록) 와 시각적으로 구분
  submissionCardRetryRequested: {
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
  },

  // 썸네일
  thumbnailScroll: { marginHorizontal: -14, paddingHorizontal: 14 },
  thumbnailRow: { gap: 8, paddingRight: 14 },
  thumbnail: { width: 90, height: 90, borderRadius: 10, backgroundColor: '#F1F5F9' },
  imageCountBadge: {
    position: 'absolute', bottom: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2,
  },
  imageCountText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // 피드백 버튼 행 (버튼 자체 스타일은 FeedbackButton.tsx로 이동)
  feedbackRow: { flexDirection: 'row', gap: 8 },

  // 💧 코멘트 입력 영역
  commentArea: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  commentInput: {
    fontSize: 14,
    color: '#0F172A',
    lineHeight: 20,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  commentSaveBtn: {
    alignSelf: 'flex-end',
    backgroundColor: '#5B50E8',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 18,
    minWidth: 60,
    alignItems: 'center',
  },
  commentSaveBtnOff: { backgroundColor: '#CBD5E1' },
  commentSaveBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // ── 미제출자 카드
  nonSubmitCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    overflow: 'hidden',
  },
  nonSubmitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dividerLine: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 14,
  },
  // 알림 보내기 버튼
  reminderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#EEEDF9',
    minWidth: 60,
    justifyContent: 'center',
  },
  reminderBtnSending: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  reminderBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5B50E8',
  },
  nonSubmitAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#CBD5E1',
    alignItems: 'center', justifyContent: 'center',
  },
  nonSubmitAvatarText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  nonSubmitNameBlock: { flex: 1, gap: 1 },
  nonSubmitName: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  nonSubmitSchool: { fontSize: 11, color: '#94A3B8' },
  nonSubmitChip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  nonSubmitChipText: { fontSize: 12, fontWeight: '700', color: '#64748B' },

  // ── 이미지 전체보기 모달
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
  },
  previewCloseBtn: {
    position: 'absolute', top: 56, right: 16,
    zIndex: 10,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  previewPageIndicator: {
    position: 'absolute', top: 64,
    alignSelf: 'center',
    zIndex: 10,
    fontSize: 14, fontWeight: '600', color: '#fff',
  },
  previewImageWrapper: {
    width: 375,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: { width: '100%', height: '75%' },
});
