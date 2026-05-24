/**
 * app/(app)/(teacher)/attendance-export.tsx
 *
 * 선생님 전용 — 출결 엑셀 내보내기 화면.
 * Pro 플랜 게이팅 → 반 선택 → 연월 선택 → 생성 & 공유.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import firestore, { documentId } from '@react-native-firebase/firestore';
import * as Sharing from 'expo-sharing';

import { useAuthStore } from '../../../store/useAuthStore';
import { Collections } from '../../../lib/firestore';
import {
  getClassMonthlyDataForExport,
  fetchStudentsForExport,
} from '../../../lib/attendance';
import { generateLegalAttendanceExcel } from '../../../lib/excelExporter';
import ProUpgradeSheet from '../../../components/ProUpgradeSheet';
import { strings } from '../../../constants/strings';
import type { Class } from '../../../types';

// ─────────────────────────────────────────────────────────────
// 연월 유틸
// ─────────────────────────────────────────────────────────────

function prevMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function nextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

// ─────────────────────────────────────────────────────────────
// AttendanceExportScreen
// ─────────────────────────────────────────────────────────────

export default function AttendanceExportScreen() {
  const { top } = useSafeAreaInsets();
  const { user, academy } = useAuthStore();

  // 유료 플랜 게이팅 — free 플랜이면 업그레이드 시트 표시 (starter / standard / pro / trial 모두 허용)
  const isPro = academy?.plan !== 'free' && !!academy?.plan;
  const [showProSheet, setShowProSheet] = useState(!isPro);

  // 선생님 담당 반 목록
  const [classes, setClasses]         = useState<Class[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);

  // 선택 상태
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1~12

  // 생성 진행 상태
  const [generating, setGenerating] = useState(false);

  // ── 담당 반 목록 로드 ──
  useEffect(() => {
    const classIds = user?.assigned_class_ids ?? [];
    if (classIds.length === 0) {
      setLoadingClasses(false);
      return;
    }
    // RN Firebase: documentId() modular 함수 사용 (FieldPath.documentId() static 미구현)
    Collections.classes()
      .where(documentId(), 'in', classIds)
      .get()
      .then((snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Class));
        setClasses(list);
        if (list.length > 0) setSelectedClassId(list[0].id);
      })
      .catch((e) => {
        console.error('[AttendanceExport] 반 목록 로드 실패:', e);
      })
      .finally(() => {
        setLoadingClasses(false);
      });
  }, [user?.uid]);

  // ── 엑셀 생성 & 공유 ──
  const handleExport = async () => {
    if (!selectedClassId || !user?.academy_id) return;

    const cls = classes.find((c) => c.id === selectedClassId);
    if (!cls) return;

    setGenerating(true);
    try {
      // 1) 반 학생 목록 조회 — 재원 학생 + 해당 월에 수강기간이 걸친 퇴원자 포함
      //    (lib/attendance.ts 의 공통 헬퍼로 web/admin/teacher 3곳 동기화 부담 감소)
      const students = await fetchStudentsForExport(
        user.academy_id,
        selectedClassId,
        year,
        month,
      );

      if (students.length === 0) {
        Alert.alert('', strings.export.noStudents);
        return;
      }

      // 2) 월간 출결 데이터 조회
      const attendanceData = await getClassMonthlyDataForExport(
        selectedClassId,
        year,
        month,
      );

      // 3) 엑셀 파일 생성
      const { uri } = await generateLegalAttendanceExcel({
        academyName:  academy?.name ?? '',
        className:    cls.name,
        subjectName:  cls.subject ?? '',
        teacherName:  user.name,
        year,
        month,
        students,
        attendanceData,
      });

      // 4) 시스템 공유 시트 표시
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: `${cls.name} ${year}년 ${month}월 출결현황`,
          UTI: 'com.microsoft.excel.xlsx',
        });
      } else {
        Alert.alert('', strings.export.shareError);
      }
    } catch (e) {
      console.error('[AttendanceExport] 엑셀 생성 실패:', e);
      Alert.alert('', strings.export.shareError);
    } finally {
      setGenerating(false);
    }
  };

  // ── 선택된 반 객체 ──
  const selectedClass = classes.find((c) => c.id === selectedClassId);

  return (
    <View style={[styles.container, { paddingTop: top }]}>

      {/* ── 헤더 ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{strings.export.title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── 반 선택 ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{strings.export.selectClass}</Text>
          {loadingClasses ? (
            <ActivityIndicator color="#5B50E8" style={{ marginTop: 8 }} />
          ) : classes.length === 0 ? (
            <Text style={styles.emptyHint}>담당 반이 없어요</Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.classChipRow}
            >
              {classes.map((cls) => {
                const active = cls.id === selectedClassId;
                return (
                  <TouchableOpacity
                    key={cls.id}
                    style={[styles.classChip, active && styles.classChipActive]}
                    onPress={() => setSelectedClassId(cls.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.classChipText, active && styles.classChipTextActive]}>
                      {cls.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* ── 교습과목 미리보기 (선택된 반의 subject) ── */}
        {selectedClass?.subject ? (
          <View style={styles.subjectHint}>
            <Ionicons name="book-outline" size={14} color="#5B50E8" />
            <Text style={styles.subjectHintText}>교습과목: {selectedClass.subject}</Text>
          </View>
        ) : null}

        {/* ── 연월 선택 ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{strings.export.selectMonth}</Text>
          <View style={styles.monthRow}>
            {/* 이전 달 */}
            <TouchableOpacity
              onPress={() => { const p = prevMonth(year, month); setYear(p.year); setMonth(p.month); }}
              activeOpacity={0.7}
              style={styles.monthArrow}
            >
              <Ionicons name="chevron-back" size={22} color="#334155" />
            </TouchableOpacity>

            {/* 연월 표시 */}
            <Text style={styles.monthLabel}>
              {year}년 {month}월
            </Text>

            {/* 다음 달 — 미래 월은 비활성 */}
            <TouchableOpacity
              onPress={() => {
                const n = nextMonth(year, month);
                const current = new Date();
                if (
                  n.year < current.getFullYear() ||
                  (n.year === current.getFullYear() && n.month <= current.getMonth() + 1)
                ) {
                  setYear(n.year);
                  setMonth(n.month);
                }
              }}
              activeOpacity={0.7}
              style={styles.monthArrow}
            >
              <Ionicons name="chevron-forward" size={22} color="#334155" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 내보내기 안내 카드 ── */}
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>법정 출석부 형식</Text>
          <Text style={styles.infoCardDesc}>
            교육청 제출용 법정 출석부(xlsx) 형식으로 생성됩니다.{'\n'}
            번호·성명·생년월일·보호자연락처·수강기간·출결 기호·합계가 포함됩니다.
          </Text>
        </View>

      </ScrollView>

      {/* ── 하단 버튼 ── */}
      <View style={styles.bottomWrapper}>
        <TouchableOpacity
          style={[
            styles.exportBtn,
            (!selectedClassId || generating) && styles.exportBtnDisabled,
          ]}
          onPress={handleExport}
          disabled={!selectedClassId || generating}
          activeOpacity={0.85}
        >
          {generating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="download-outline" size={20} color="#fff" />
              <Text style={styles.exportBtnText}>{strings.export.exportButton}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Pro 플랜 게이팅 시트 ── */}
      <ProUpgradeSheet
        visible={showProSheet}
        onClose={() => { setShowProSheet(false); router.back(); }}
        featureName={strings.export.proFeatureName}
      />

    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// 스타일
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },

  // ── 헤더 ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },

  // ── 스크롤 영역 ──
  scrollContent: {
    padding: 20,
    gap: 24,
    paddingBottom: 16,
  },

  // ── 섹션 ──
  section: {
    gap: 10,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptyHint: {
    fontSize: 14,
    color: '#94A3B8',
  },

  // ── 반 칩 ──
  classChipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  classChip: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  classChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  classChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  classChipTextActive: {
    color: '#fff',
  },

  // ── 교습과목 힌트 ──
  subjectHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: -16,
  },
  subjectHintText: {
    fontSize: 13,
    color: '#5B50E8',
    fontWeight: '500',
  },

  // ── 연월 선택 ──
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 6,
  },
  monthArrow: {
    width: 48,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },

  // ── 안내 카드 ──
  infoCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 6,
  },
  infoCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  infoCardDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 20,
  },

  // ── 하단 버튼 ──
  bottomWrapper: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#5B50E8',
    borderRadius: 14,
    height: 52,
  },
  exportBtnDisabled: {
    backgroundColor: '#E2E8F0',
  },
  exportBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
