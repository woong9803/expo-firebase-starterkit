/**
 * app/(app)/(admin)/homework-review.tsx — 원장님 숙제 검사·피드백 화면
 *
 * 선생님 숙제 검사 화면과 동일한 기능.
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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { Collections } from '../../../lib/firestore';
import { useAuthStore } from '../../../store/useAuthStore';
import FeedbackButton from '../../../components/FeedbackButton';
import { Homework, Submission, User } from '../../../types';

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface SubmissionWithStudent extends Submission {
  studentUid: string;
  studentName: string;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function AdminHomeworkReviewScreen() {
  const router = useRouter();
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

  // ── 숙제 + 학생 목록 1회 로드 ────────────────────────────────────────────
  useEffect(() => {
    if (!hwId || !user?.academy_id) return;

    (async () => {
      try {
        // 1단계: 숙제 문서 조회
        const hwSnap = await getDoc(Collections.homework(hwId));
        if (!hwSnap.exists()) {
          setIsLoading(false);
          return;
        }
        const hw = { id: hwSnap.id, ...hwSnap.data() } as Homework;
        setHomework(hw);

        // 2단계: 해당 반 학생 목록 조회
        const studentSnap = await getDocs(
          query(
            Collections.users(),
            where('academy_id', '==', user.academy_id),
            where('class_id', '==', hw.class_id),
          )
        );
        const studentList = studentSnap.docs
          .map(d => ({ uid: d.id, ...d.data() } as User))
          .filter(u => u.role === 'student' && u.is_active);
        setStudents(studentList);

        if (studentList.length === 0) setIsLoading(false);
      } catch (e) {
        console.error('[AdminHomeworkReview] 초기 데이터 로드 실패:', e);
        setIsLoading(false);
      }
    })();
  }, [hwId, user?.academy_id]);

  // ── 제출물 실시간 구독 ────────────────────────────────────────────────────
  useEffect(() => {
    if (!hwId || students.length === 0) return;

    // 학생 이름 맵 (uid → name)
    const nameMap: Record<string, string> = {};
    students.forEach(s => { nameMap[s.uid] = s.name; });

    const unsub = onSnapshot(Collections.submissions(hwId), (snap) => {
      const list = snap.docs.map(d => ({
        studentUid: d.id,
        studentName: nameMap[d.id] ?? '알 수 없음',
        ...d.data(),
      } as SubmissionWithStudent));

      // 제출 시간 기준 정렬 (최신 제출 우선)
      list.sort((a, b) =>
        (b.submitted_at?.toMillis() ?? 0) - (a.submitted_at?.toMillis() ?? 0)
      );

      setSubmissions(list);
      setIsLoading(false);
    }, (e) => {
      console.error('[AdminHomeworkReview] 제출물 구독 실패:', e);
      setIsLoading(false);
    });

    return () => unsub();
  }, [hwId, students]);

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
      await updateDoc(Collections.submission(hwId, studentUid), {
        feedback: newFeedback,
        status: newFeedback ? 'checked' : 'submitted',
      });
    } catch (e) {
      console.error('[AdminHomeworkReview] 피드백 저장 실패:', e);
    }
  }, [hwId]);

  // ── 파생 데이터 ───────────────────────────────────────────────────────────
  const submittedUids  = new Set(submissions.map(s => s.studentUid));
  const nonSubmitters  = students.filter(s => !submittedUids.has(s.uid));
  const submitRatio    = students.length > 0 ? submissions.length / students.length : 0;

  // ── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.navigate('/(app)/(admin)/homework')}
          style={styles.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
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
            {/* 검사 완료 수 */}
            <Text style={styles.checkedLabel}>
              검사 완료 {submissions.filter(s => s.status === 'checked').length}명
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
                  <View key={s.uid} style={styles.nonSubmitRow}>
                    <View style={styles.nonSubmitAvatar}>
                      <Text style={styles.nonSubmitAvatarText}>{s.name.charAt(0)}</Text>
                    </View>
                    <Text style={styles.nonSubmitName}>{s.name}</Text>
                    <View style={styles.nonSubmitChip}>
                      <Text style={styles.nonSubmitChipText}>미제출</Text>
                    </View>
                    {idx < nonSubmitters.length - 1 && (
                      <View style={styles.divider} />
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
  onImagePress: (images: string[], index: number) => void;
}

function SubmissionCard({ submission, onFeedback, onImagePress }: SubmissionCardProps) {
  const { studentName, image_urls, is_late, feedback, submitted_at } = submission;

  const submittedAt = submitted_at
    ? submitted_at.toDate().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <View style={[styles.submissionCard, submission.status === 'checked' && styles.submissionCardChecked]}>
      {/* 상단: 학생 정보 */}
      <View style={styles.submissionTop}>
        <View style={styles.submissionAvatar}>
          <Text style={styles.submissionAvatarText}>{studentName.charAt(0)}</Text>
        </View>
        <View style={styles.submissionInfo}>
          <View style={styles.submissionNameRow}>
            <Text style={styles.submissionName}>{studentName}</Text>
            {is_late && (
              <View style={styles.lateChip}>
                <Text style={styles.lateChipText}>지각</Text>
              </View>
            )}
            {submission.status === 'checked' && (
              <View style={styles.checkedChip}>
                <Text style={styles.checkedChipText}>검사완료</Text>
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

      {/* 피드백 버튼 */}
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
            length: 375,
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
    paddingTop: 52,
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
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', letterSpacing: -0.4 },
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
  submittedAt: { fontSize: 12, color: '#94A3B8' },

  // 지각 칩
  lateChip: {
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  lateChipText: { fontSize: 11, fontWeight: '700', color: '#991B1B' },

  // 검사 완료 칩
  checkedChip: {
    backgroundColor: '#ECFDF5',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  checkedChipText: { fontSize: 11, fontWeight: '700', color: '#065F46' },

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

  // 피드백 버튼 행
  feedbackRow: { flexDirection: 'row', gap: 8 },

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
    opacity: 0.45,
  },
  divider: {
    position: 'absolute',
    bottom: 0,
    left: 14,
    right: 14,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  nonSubmitAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#CBD5E1',
    alignItems: 'center', justifyContent: 'center',
  },
  nonSubmitAvatarText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  nonSubmitName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#0F172A' },
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
