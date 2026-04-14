/**
 * app/(app)/(parent)/child-homework.tsx — 자녀 숙제 상세 (비탭 화면)
 *
 * router.params: homeworkId, childUid
 * - 숙제 제목/내용/마감일 표시
 * - 제출 있으면: 이미지 목록, 피드백 칩(👍 pass / 💧 retry), 제출일
 * - 제출 없으면: '아직 제출하지 않았어요' 안내
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getDoc } from 'firebase/firestore';

import { Collections } from '../../../lib/firestore';
import { strings } from '../../../constants/strings';
import type { Homework, Submission } from '../../../types';

// ─────────────────────────────────────────────────────────────
// 날짜 포맷 유틸
// ─────────────────────────────────────────────────────────────

function formatTimestamp(ts: Submission['submitted_at']): string {
  if (!ts) return '';
  const d = ts.toDate();
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDueDate(hw: Homework): string {
  const d = hw.due_date.toDate();
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

// ─────────────────────────────────────────────────────────────
// 피드백 칩 컴포넌트
// ─────────────────────────────────────────────────────────────

interface FeedbackChipProps {
  feedback: '👍' | '💧';
}

function FeedbackChip({ feedback }: FeedbackChipProps) {
  const isPass = feedback === '👍';
  return (
    <View style={[styles.feedbackChip, isPass ? styles.feedbackPass : styles.feedbackRetry]}>
      <Text style={styles.feedbackEmoji}>{feedback}</Text>
      <Text style={[styles.feedbackLabel, isPass ? styles.feedbackPassText : styles.feedbackRetryText]}>
        {isPass ? strings.parent.feedbackPass : strings.parent.feedbackRetry}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// 메인 화면
// ─────────────────────────────────────────────────────────────

export default function ChildHomeworkScreen() {
  const insets = useSafeAreaInsets();
  const { homeworkId, childUid } = useLocalSearchParams<{
    homeworkId: string;
    childUid: string;
  }>();

  const [homework, setHomework]   = useState<Homework | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]         = useState<string | null>(null);

  // ── 숙제 + 제출물 조회 ──────────────────────────────────────
  useEffect(() => {
    if (!homeworkId || !childUid) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    Promise.all([
      getDoc(Collections.homework(homeworkId)),
      getDoc(Collections.submission(homeworkId, childUid)),
    ])
      .then(([hwSnap, subSnap]) => {
        if (hwSnap.exists()) {
          setHomework({ id: hwSnap.id, ...hwSnap.data() } as Homework);
        } else {
          setError(strings.common.error);
        }
        setSubmission(subSnap.exists() ? (subSnap.data() as Submission) : null);
      })
      .catch((e) => {
        console.warn('[ChildHomework] 조회 오류:', e);
        setError(strings.common.error);
      })
      .finally(() => setIsLoading(false));
  }, [homeworkId, childUid]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* ── 헤더 ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.navigate('/(app)/(parent)/homework')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{strings.parent.childDetail}</Text>
        <View style={styles.headerRight} />
      </View>

      {/* ── 로딩 ── */}
      {isLoading && (
        <View style={styles.centerBox}>
          <ActivityIndicator color="#F59E0B" size="large" />
        </View>
      )}

      {/* ── 오류 ── */}
      {!isLoading && error && (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* ── 본문 ── */}
      {!isLoading && !error && homework && (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* 숙제 정보 카드 */}
          <View style={styles.hwInfoCard}>
            <Text style={styles.hwTitle}>{homework.title}</Text>
            {homework.content ? (
              <Text style={styles.hwContent}>{homework.content}</Text>
            ) : null}
            <View style={styles.hwMeta}>
              <Ionicons name="calendar-outline" size={14} color="#64748B" />
              <Text style={styles.hwMetaText}>마감: {formatDueDate(homework)}</Text>
            </View>
          </View>

          {/* ── 제출 있을 때 ── */}
          {submission ? (
            <>
              {/* 제출 정보 */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>제출 정보</Text>
              </View>

              <View style={styles.submissionCard}>
                {/* 제출일 */}
                <View style={styles.submissionRow}>
                  <Text style={styles.submissionLabel}>제출일</Text>
                  <Text style={styles.submissionValue}>
                    {formatTimestamp(submission.submitted_at)}
                  </Text>
                </View>

                {/* 지각 여부 */}
                {submission.is_late && (
                  <View style={styles.lateChip}>
                    <Text style={styles.lateChipText}>지각 제출</Text>
                  </View>
                )}

                {/* 피드백 */}
                {submission.feedback && (
                  <View style={styles.submissionRow}>
                    <Text style={styles.submissionLabel}>선생님 피드백</Text>
                    <FeedbackChip feedback={submission.feedback} />
                  </View>
                )}
              </View>

              {/* 제출 이미지 */}
              {submission.image_urls.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>
                      제출 이미지 ({submission.image_urls.length}장)
                    </Text>
                  </View>
                  {submission.image_urls.map((url, idx) => (
                    <Image
                      key={idx}
                      source={{ uri: url }}
                      style={styles.submissionImage}
                      resizeMode="contain"
                    />
                  ))}
                </>
              )}
            </>
          ) : (
            /* ── 미제출 안내 ── */
            <View style={styles.notSubmittedCard}>
              <Text style={styles.notSubmittedIcon}>📭</Text>
              <Text style={styles.notSubmittedText}>아직 제출하지 않았어요</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// 스타일
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  // ── 헤더 ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#ffffff',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginLeft: 8,
  },
  headerRight: {
    width: 30,
  },

  // ── 중앙 배치 ──
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
    paddingHorizontal: 24,
  },

  // ── 스크롤 ──
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  // ── 숙제 정보 카드 ──
  hwInfoCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  hwTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  hwContent: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 10,
  },
  hwMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hwMetaText: {
    fontSize: 13,
    color: '#64748B',
  },

  // ── 섹션 헤더 ──
  sectionHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },

  // ── 제출 정보 카드 ──
  submissionCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    gap: 10,
  },
  submissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  submissionLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  submissionValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },

  // ── 지각 칩 ──
  lateChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  lateChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#991B1B',
  },

  // ── 피드백 칩 ──
  feedbackChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  feedbackPass: {
    backgroundColor: '#ECFDF5',
  },
  feedbackRetry: {
    backgroundColor: '#FEF2F2',
  },
  feedbackEmoji: {
    fontSize: 14,
  },
  feedbackLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  feedbackPassText: {
    color: '#065F46',
  },
  feedbackRetryText: {
    color: '#991B1B',
  },

  // ── 제출 이미지 ──
  submissionImage: {
    width: '100%',
    height: 240,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#F1F5F9',
  },

  // ── 미제출 안내 ──
  notSubmittedCard: {
    alignItems: 'center',
    paddingVertical: 48,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
  },
  notSubmittedIcon: {
    fontSize: 44,
    marginBottom: 12,
  },
  notSubmittedText: {
    fontSize: 15,
    color: '#94A3B8',
  },
});
