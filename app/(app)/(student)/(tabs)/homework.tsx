/**
 * app/(app)/(student)/homework.tsx — 학생 숙제 목록 화면
 *
 * 탭: 미제출 / 검사대기 / 다시제출(💧) / 완료(👍)
 * - 제출 후 화면 복귀 시 useFocusEffect로 제출 현황 자동 갱신
 * - 검사대기·완료 카드 탭 → 사진 뷰어 모달
 * - 검사대기: 수정하기 버튼 → 제출 화면
 * - 다시제출: 다시 제출하기 버튼 → 제출 화면
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  Pressable,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Collections } from '../../../../lib/firestore';
import { useAuthStore } from '../../../../store/useAuthStore';
import { Homework, Submission } from '../../../../types';

// 임시저장 AsyncStorage 키 (homework-submit.tsx와 동일)
const PENDING_KEY = 'pendingSubmission';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface HomeworkWithSubmission extends Homework {
  submission: Submission | null;
}

type TabKey = '미제출' | '검사대기' | '다시제출' | '완료';

// ── D-Day 계산 ─────────────────────────────────────────────────────────────────

function calcDDay(dueDate: { toDate: () => Date }): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = dueDate.toDate();
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function StudentHomeworkScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();

  // 숙제 목록 (onSnapshot)
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  // 제출 현황 맵 (hwId → Submission | null)
  const [submissionMap, setSubmissionMap] = useState<Record<string, Submission | null>>({});

  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('미제출');

  // 사진 뷰어 모달
  const [detailItem, setDetailItem] = useState<HomeworkWithSubmission | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);


  // ── 앱 시작 시 임시저장본 감지 ───────────────────────────────────────────────
  // 업로드 실패로 저장된 제출물이 있으면 이어서 제출 다이얼로그 표시
  useEffect(() => {
    AsyncStorage.getItem(PENDING_KEY).then((json) => {
      if (!json) return;
      try {
        const saved = JSON.parse(json);
        if (!saved.hwId || !Array.isArray(saved.uris) || saved.uris.length === 0) return;
        const title = saved.title ? `'${saved.title}' ` : '';
        Alert.alert(
          '이어서 제출할까요?',
          `${title}숙제 제출 중 저장된 사진이 있어요.\n이어서 제출하시겠어요?`,
          [
            { text: '아니요', style: 'cancel' },
            {
              text: '이어서 제출',
              onPress: () =>
                router.push({
                  pathname: '/(app)/(student)/homework-submit',
                  params: { hwId: saved.hwId, restorePending: 'true' },
                }),
            },
          ]
        );
      } catch {
        // 파싱 실패 시 임시저장 데이터 삭제
        AsyncStorage.removeItem(PENDING_KEY);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 마운트 시 1회만 확인

  // ── 숙제 실시간 구독 ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.class_id || !user?.uid) {
      setIsLoading(false);
      return;
    }

    const q = query(
      Collections.homeworks(),
      where('class_id', '==', user.class_id),
      orderBy('due_date', 'asc'),
    );

    const unsub = onSnapshot(q, (snap) => {
      const hws = snap.docs.map(d => ({ id: d.id, ...d.data() } as Homework));
      setHomeworks(hws);
      setIsLoading(false);
    }, (e) => {
      console.error('[StudentHomework] 숙제 구독 실패:', e);
      setIsLoading(false);
    });

    return () => unsub();
  }, [user?.class_id, user?.uid]);

  // ── 각 숙제 제출 상태 실시간 구독 ──────────────────────────────────────────
  // 선생님이 피드백(👍/💧)을 저장하면 submission 문서가 변경되므로 즉시 반영
  useEffect(() => {
    if (!user?.uid || homeworks.length === 0) return;

    const unsubs = homeworks.map((hw) =>
      onSnapshot(
        Collections.submission(hw.id, user.uid),
        (snap) => {
          const sub = snap.exists() ? (snap.data() as Submission) : null;
          setSubmissionMap(prev => ({ ...prev, [hw.id]: sub }));
        },
        (e) => console.warn(`[StudentHomework] 제출 구독 실패(${hw.id}):`, e)
      )
    );

    return () => unsubs.forEach(u => u());
  }, [homeworks.map(h => h.id).join(','), user?.uid]);

  // ── 합친 데이터 ─────────────────────────────────────────────────────────────
  // 마감일이 오늘 기준 7일 이전이면 자동 제외 (마감 당일 포함 7일간 표시)
  const items: HomeworkWithSubmission[] = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 7); // 오늘 - 7일 (해당일 포함)

    return homeworks
      .filter(hw => {
        const due = (hw.due_date as any).toDate();
        due.setHours(0, 0, 0, 0);
        return due >= cutoff; // 마감일이 cutoff 이상이면 표시
      })
      .map(hw => ({ ...hw, submission: submissionMap[hw.id] ?? null }));
  }, [homeworks, submissionMap]);

  // ── 탭별 필터 ──────────────────────────────────────────────────────────────
  const tabItems = useMemo(() => {
    switch (activeTab) {
      case '미제출':   return items.filter(i => i.submission === null);
      case '검사대기': return items.filter(i => i.submission?.status === 'submitted');
      case '다시제출': return items.filter(i => i.submission?.status === 'checked' && i.submission.feedback === '💧');
      case '완료':    return items.filter(i => i.submission?.status === 'checked' && i.submission.feedback !== '💧');
    }
  }, [items, activeTab]);

  // 탭별 카운트
  const counts: Record<TabKey, number> = useMemo(() => ({
    미제출:   items.filter(i => i.submission === null).length,
    검사대기: items.filter(i => i.submission?.status === 'submitted').length,
    다시제출: items.filter(i => i.submission?.status === 'checked' && i.submission.feedback === '💧').length,
    완료:    items.filter(i => i.submission?.status === 'checked' && i.submission.feedback !== '💧').length,
  }), [items]);

  // ── 제출 화면 이동 ──────────────────────────────────────────────────────────
  const goToSubmit = (hwId: string, skipAlert = false) => {
    router.push({
      pathname: '/(app)/(student)/homework-submit',
      params: { hwId, skipAlert: skipAlert ? 'true' : 'false' },
    });
  };

  // ── 렌더 ─────────────────────────────────────────────────────────────────
  const TABS: TabKey[] = ['미제출', '검사대기', '다시제출', '완료'];

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={[styles.header, { paddingTop: top + 12 }]}>
        <Text style={styles.headerTitle}>숙제</Text>
      </View>

      {/* 탭 바 */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab}
            </Text>
            {counts[tab] > 0 && (
              <View style={[styles.tabBadge, activeTab === tab && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, activeTab === tab && styles.tabBadgeTextActive]}>
                  {counts[tab]}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* 콘텐츠 */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#5B50E8" />
        </View>
      ) : !user?.class_id ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🏫</Text>
          <Text style={styles.emptyTitle}>반에 소속되어 있지 않아요</Text>
          <Text style={styles.emptyDesc}>선생님께 반 등록을 요청해주세요</Text>
        </View>
      ) : tabItems.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>
            {activeTab === '미제출' ? '🎉' : activeTab === '검사대기' ? '⏳' : activeTab === '다시제출' ? '💧' : '✅'}
          </Text>
          <Text style={styles.emptyTitle}>
            {activeTab === '미제출' ? '미제출 숙제가 없어요!'
              : activeTab === '검사대기' ? '검사 대기 중인 숙제가 없어요'
              : activeTab === '다시제출' ? '다시 제출할 숙제가 없어요'
              : '완료된 숙제가 없어요'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {tabItems.map((item) => (
            <HomeworkCard
              key={item.id}
              item={item}
              onViewDetail={() => {
                setDetailItem(item);
                setPreviewIndex(0);
              }}
              onSubmit={() => goToSubmit(item.id)}
              onResubmit={() => goToSubmit(item.id, true)}
            />
          ))}
        </ScrollView>
      )}

      {/* 사진 뷰어 모달 */}
      <SubmissionDetailModal
        item={detailItem}
        previewIndex={previewIndex}
        onIndexChange={setPreviewIndex}
        onClose={() => setDetailItem(null)}
        onResubmit={() => {
          if (!detailItem) return;
          setDetailItem(null);
          goToSubmit(detailItem.id, true);
        }}
      />
    </View>
  );
}

// ── 숙제 카드 ─────────────────────────────────────────────────────────────────

interface HomeworkCardProps {
  item: HomeworkWithSubmission;
  onViewDetail: () => void;
  onSubmit: () => void;
  onResubmit: () => void;
}

function HomeworkCard({ item, onViewDetail, onSubmit, onResubmit }: HomeworkCardProps) {
  const { title, content, due_date, submission } = item;
  const dDay = calcDDay(due_date as any);
  const dueStr = (due_date as any).toDate().toLocaleDateString('ko-KR');

  // ── 완료 카드 (👍 또는 피드백 없음)
  if (submission?.status === 'checked' && submission.feedback !== '💧') {
    return (
      <TouchableOpacity style={[styles.card, styles.cardChecked]} onPress={onViewDetail} activeOpacity={0.85}>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
          <View style={styles.chipDone}><Text style={styles.chipDoneText}>완료</Text></View>
        </View>
        {!!content && <Text style={styles.cardContent} numberOfLines={2}>{content}</Text>}
        <Text style={styles.cardDue}>마감 {dueStr}</Text>
        <View style={styles.feedbackRow}>
          <Text style={styles.feedbackEmoji}>{submission.feedback ?? '✅'}</Text>
          <Text style={styles.feedbackLabel}>
            {submission.feedback === '👍' ? '선생님이 잘했어요!' : '검사 완료 · 피드백 대기 중'}
          </Text>
        </View>
        {/* 선생님 텍스트 코멘트 */}
        {!!submission.feedback_comment && (
          <View style={styles.commentBox}>
            <Text style={styles.commentText}>{submission.feedback_comment}</Text>
          </View>
        )}
        <Text style={styles.viewPhotoHint}>사진 보기 →</Text>
      </TouchableOpacity>
    );
  }

  // ── 다시제출 카드 (💧)
  if (submission?.status === 'checked' && submission.feedback === '💧') {
    return (
      <TouchableOpacity style={[styles.card, styles.cardRetry]} onPress={onViewDetail} activeOpacity={0.85}>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
          <View style={styles.chipRetry}><Text style={styles.chipRetryText}>다시제출</Text></View>
        </View>
        {!!content && <Text style={styles.cardContent} numberOfLines={2}>{content}</Text>}
        <Text style={styles.cardDue}>마감 {dueStr}</Text>
        <View style={styles.feedbackRow}>
          <Text style={styles.feedbackEmoji}>💧</Text>
          <Text style={[styles.feedbackLabel, { color: '#78350F' }]}>선생님이 다시 풀어보래요</Text>
        </View>
        {/* 선생님 텍스트 코멘트 */}
        {!!submission.feedback_comment && (
          <View style={[styles.commentBox, styles.commentBoxRetry]}>
            <Text style={[styles.commentText, styles.commentTextRetry]}>{submission.feedback_comment}</Text>
          </View>
        )}
        <TouchableOpacity style={styles.retrySubmitBtn} onPress={onResubmit} activeOpacity={0.85}>
          <Ionicons name="camera" size={14} color="#fff" />
          <Text style={styles.retrySubmitBtnText}>다시 제출하기</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  // ── 검사대기 카드
  if (submission?.status === 'submitted') {
    const submittedStr = submission.submitted_at
      ? submission.submitted_at.toDate().toLocaleDateString('ko-KR')
      : '';
    return (
      <TouchableOpacity style={[styles.card, styles.cardSubmitted]} onPress={onViewDetail} activeOpacity={0.85}>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
          <View style={styles.chipPending}><Text style={styles.chipPendingText}>검사대기</Text></View>
        </View>
        {!!content && <Text style={styles.cardContent} numberOfLines={2}>{content}</Text>}
        <Text style={styles.cardDue}>마감 {dueStr}</Text>
        <Text style={styles.submittedInfo}>
          {submittedStr} 제출{submission.is_late ? ' · 지각' : ''}
        </Text>
        {/* 수정하기 버튼 */}
        <TouchableOpacity style={styles.editBtn} onPress={onResubmit} activeOpacity={0.85}>
          <Ionicons name="pencil-outline" size={13} color="#5B50E8" />
          <Text style={styles.editBtnText}>수정하기</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  // ── 미제출 카드
  const isUrgent = dDay <= 0;
  return (
    <TouchableOpacity
      style={[styles.card, isUrgent ? styles.cardUrgent : styles.cardNormal]}
      onPress={onSubmit}
      activeOpacity={0.85}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
        <View style={[styles.dDayChip, isUrgent ? styles.dDayChipRed : styles.dDayChipBlue]}>
          <Text style={[styles.dDayText, isUrgent ? styles.dDayTextRed : styles.dDayTextBlue]}>
            {dDay > 0 ? `D-${dDay}` : dDay === 0 ? 'D-0' : '마감'}
          </Text>
        </View>
      </View>
      {!!content && <Text style={styles.cardContent} numberOfLines={2}>{content}</Text>}
      <Text style={styles.cardDue}>마감 {dueStr}</Text>
      <TouchableOpacity
        style={[styles.submitBtn, isUrgent ? styles.submitBtnUrgent : styles.submitBtnNormal]}
        onPress={onSubmit}
        activeOpacity={0.85}
      >
        <Ionicons name="camera" size={15} color={isUrgent ? '#fff' : '#5B50E8'} />
        <Text style={[styles.submitBtnText, isUrgent ? styles.submitBtnTextUrgent : styles.submitBtnTextNormal]}>
          {isUrgent ? '지금 바로 제출하기' : '사진 찍어 제출하기'}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ── 제출물 사진 뷰어 모달 ───────────────────────────────────────────────────────

interface SubmissionDetailModalProps {
  item: HomeworkWithSubmission | null;
  previewIndex: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  onResubmit: () => void;
}

function SubmissionDetailModal({ item, previewIndex, onIndexChange, onClose, onResubmit }: SubmissionDetailModalProps) {
  const { top } = useSafeAreaInsets();
  if (!item) return null;
  const { submission } = item;
  const images = submission?.image_urls ?? [];
  const isRetry = submission?.feedback === '💧';
  const isPending = submission?.status === 'submitted';

  return (
    <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        {/* 헤더 */}
        <View style={[styles.modalHeader, { paddingTop: top + 12 }]}>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color="#0F172A" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.modalSub}>
              {submission?.submitted_at
                ? `${submission.submitted_at.toDate().toLocaleDateString('ko-KR')} 제출`
                : ''}
              {submission?.is_late ? ' · 지각' : ''}
            </Text>
          </View>
          {images.length > 0 && (
            <Text style={styles.modalPageIndicator}>{previewIndex + 1}/{images.length}</Text>
          )}
        </View>

        {/* 사진 스와이프 */}
        {images.length > 0 ? (
          <FlatList
            data={images}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={previewIndex}
            getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              onIndexChange(idx);
            }}
            renderItem={({ item: uri }) => (
              <View style={styles.modalImageWrapper}>
                <Image source={{ uri }} style={styles.modalImage} resizeMode="contain" />
              </View>
            )}
            style={{ flex: 1 }}
            keyExtractor={(_, i) => String(i)}
          />
        ) : (
          <View style={styles.center}>
            <Text style={{ color: '#94A3B8' }}>첨부된 사진이 없어요</Text>
          </View>
        )}

        {/* 하단: 피드백 + 버튼 */}
        <View style={styles.modalFooter}>
          {/* 피드백 표시 */}
          {submission?.feedback && (
            <View style={[styles.feedbackBanner, isRetry ? styles.feedbackBannerRetry : styles.feedbackBannerPass]}>
              <Text style={styles.feedbackBannerEmoji}>{submission.feedback}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.feedbackBannerText, isRetry ? { color: '#78350F' } : { color: '#065F46' }]}>
                  {isRetry ? '선생님이 다시 풀어보래요' : '선생님이 잘했어요!'}
                </Text>
                {/* 선생님 텍스트 코멘트 */}
                {!!submission.feedback_comment && (
                  <Text style={[styles.feedbackBannerComment, isRetry ? { color: '#92400E' } : { color: '#065F46' }]}>
                    {submission.feedback_comment}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* 검사대기 → 수정하기 */}
          {isPending && (
            <TouchableOpacity style={styles.modalActionBtn} onPress={onResubmit} activeOpacity={0.85}>
              <Ionicons name="pencil-outline" size={15} color="#fff" />
              <Text style={styles.modalActionBtnText}>수정하기</Text>
            </TouchableOpacity>
          )}

          {/* 다시제출 → 다시 제출하기 */}
          {isRetry && (
            <TouchableOpacity style={[styles.modalActionBtn, styles.modalActionBtnRetry]} onPress={onResubmit} activeOpacity={0.85}>
              <Ionicons name="camera" size={15} color="#fff" />
              <Text style={styles.modalActionBtnText}>다시 제출하기</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16, paddingBottom: 14,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },

  // 탭 바
  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#5B50E8' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },
  tabTextActive: { color: '#5B50E8' },
  tabBadge: {
    backgroundColor: '#E2E8F0', borderRadius: 7,
    paddingHorizontal: 5, paddingVertical: 1, minWidth: 16, alignItems: 'center',
  },
  tabBadgeActive: { backgroundColor: '#EEEDF9' },
  tabBadgeText: { fontSize: 10, fontWeight: '700', color: '#64748B' },
  tabBadgeTextActive: { color: '#5B50E8' },

  // 공통
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  emptyEmoji: { fontSize: 40, marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A', textAlign: 'center' },
  emptyDesc: { fontSize: 14, color: '#64748B', textAlign: 'center' },
  list: { padding: 16, gap: 12, paddingBottom: 32 },

  // 카드 공통
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    gap: 8, borderWidth: 1, borderColor: '#E2E8F0',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', flex: 1 },
  cardContent: { fontSize: 13, color: '#475569', lineHeight: 19 },
  cardDue: { fontSize: 13, color: '#94A3B8' },

  // 카드 타입별
  cardNormal: { borderLeftWidth: 3, borderLeftColor: '#5B50E8' },
  cardUrgent: { borderLeftWidth: 3, borderLeftColor: '#EF4444' },
  cardSubmitted: { borderLeftWidth: 3, borderLeftColor: '#F59E0B' },
  cardChecked: { backgroundColor: '#F0FDF4', borderColor: '#A7F3D0' },
  cardRetry: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },

  submittedInfo: { fontSize: 13, color: '#78350F', fontWeight: '600' },
  viewPhotoHint: { fontSize: 13, color: '#5B50E8', fontWeight: '600' },

  // D-Day 칩
  dDayChip: { borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  dDayChipBlue: { backgroundColor: '#EEEDF9' },
  dDayChipRed: { backgroundColor: '#FEE2E2' },
  dDayText: { fontSize: 12, fontWeight: '700' },
  dDayTextBlue: { color: '#5B50E8' },
  dDayTextRed: { color: '#991B1B' },

  // 상태 칩
  chipDone: { backgroundColor: '#ECFDF5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  chipDoneText: { fontSize: 12, fontWeight: '700', color: '#065F46' },
  chipPending: { backgroundColor: '#FFFBEB', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  chipPendingText: { fontSize: 12, fontWeight: '700', color: '#78350F' },
  chipRetry: { backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  chipRetryText: { fontSize: 12, fontWeight: '700', color: '#92400E' },

  // 피드백
  feedbackRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feedbackEmoji: { fontSize: 20 },
  feedbackLabel: { fontSize: 14, fontWeight: '600', color: '#065F46' },

  // 수정하기 버튼
  editBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderRadius: 10, paddingVertical: 9, marginTop: 2,
    borderWidth: 1.5, borderColor: '#5B50E8', backgroundColor: '#EEEDF9',
  },
  editBtnText: { fontSize: 14, fontWeight: '700', color: '#5B50E8' },

  // 다시 제출하기 버튼
  retrySubmitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 10, paddingVertical: 10, marginTop: 2,
    backgroundColor: '#F59E0B',
  },
  retrySubmitBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // 미제출 제출 버튼
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: 10, paddingVertical: 10, marginTop: 2,
  },
  submitBtnNormal: { backgroundColor: '#F1F0FB', borderWidth: 1, borderColor: '#EEEDF9' },
  submitBtnUrgent: { backgroundColor: '#EF4444' },
  submitBtnText: { fontSize: 14, fontWeight: '700' },
  submitBtnTextNormal: { color: '#5B50E8' },
  submitBtnTextUrgent: { color: '#fff' },

  // 사진 뷰어 모달
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  modalCloseBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  modalSub: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  modalPageIndicator: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  modalImageWrapper: {
    width: SCREEN_WIDTH,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    padding: 12,
  },
  modalImage: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  modalFooter: {
    padding: 16, paddingBottom: 36, gap: 10,
    borderTopWidth: 1, borderTopColor: '#E2E8F0',
  },
  feedbackBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, padding: 12,
  },
  feedbackBannerPass: { backgroundColor: '#ECFDF5' },
  feedbackBannerRetry: { backgroundColor: '#FFFBEB' },
  feedbackBannerEmoji: { fontSize: 24 },
  feedbackBannerText: { fontSize: 15, fontWeight: '700' },
  feedbackBannerComment: { fontSize: 13, fontWeight: '500', marginTop: 4, lineHeight: 18 },

  // 선생님 코멘트 박스 (카드 내)
  commentBox: {
    backgroundColor: '#ECFDF5', borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 12,
  },
  commentBoxRetry: { backgroundColor: '#FFFBEB' },
  commentText: { fontSize: 13, color: '#065F46', lineHeight: 18 },
  commentTextRetry: { color: '#92400E' },
  modalActionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, height: 52, borderRadius: 14, backgroundColor: '#5B50E8',
  },
  modalActionBtnRetry: { backgroundColor: '#F59E0B' },
  modalActionBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
