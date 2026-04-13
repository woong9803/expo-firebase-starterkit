/**
 * app/(app)/(teacher)/homework-create.tsx — 숙제 출제 화면
 *
 * 선생님이 제목·내용·반·마감일을 입력하여 숙제를 출제한다.
 * 마감일은 달력 DateTimePicker로 선택한다.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { addDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { Collections } from '../../../lib/firestore';
import { useAuthStore } from '../../../store/useAuthStore';
import { Class } from '../../../types';

// 날짜+시간 포맷: "2026년 4월 30일 오후 6:00"
function formatDateTime(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const h = date.getHours();
  const min = date.getMinutes();
  const ampm = h < 12 ? '오전' : '오후';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const minStr = min.toString().padStart(2, '0');
  return `${y}년 ${m}월 ${d}일 ${ampm} ${hour12}:${minStr}`;
}

// D-Day 계산
function calcDDay(date: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(date);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default function HomeworkCreateScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  // ─── 입력 상태 ──────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  // ─── 달력+시간 선택 상태 ─────────────────────────────────────────────
  // iOS: 모달에서 datetime 통합 선택
  // Android: 'date' → 날짜 선택 후 자동으로 'time' → 시간 선택
  const [showPicker, setShowPicker] = useState(false);
  const [androidStep, setAndroidStep] = useState<'date' | 'time'>('date');
  // iOS 확인 전 임시 값
  const [tempDate, setTempDate] = useState<Date>(new Date());

  // ─── 담당 반 목록 ────────────────────────────────────────────────────
  const [classes, setClasses] = useState<Class[]>([]);

  // ─── 로딩 ──────────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(false);

  // 학원 내 전체 반 목록 로드 (PRD: 전체 반 대상으로 출제 가능)
  useEffect(() => {
    if (!user?.academy_id) return;
    (async () => {
      try {
        const snap = await getDocs(
          query(Collections.classes(), where('academy_id', '==', user.academy_id))
        );
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Class));
        setClasses(list);
        if (list.length === 1) setSelectedClassId(list[0].id);
      } catch (e) {
        console.error('[HomeworkCreate] 반 목록 조회 실패:', e);
      }
    })();
  }, [user?.academy_id]);

  // ─── 피커 열기 ───────────────────────────────────────────────────────
  const openPicker = () => {
    const base = dueDate ?? new Date();
    setTempDate(base);
    setAndroidStep('date');
    setShowPicker(true);
  };

  // ─── 달력+시간 이벤트 처리 ───────────────────────────────────────────
  const handleDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      if (event.type !== 'set' || !selected) {
        // 취소
        setShowPicker(false);
        return;
      }
      if (androidStep === 'date') {
        // 날짜 선택 완료 → 시간 선택으로 자동 전환
        setTempDate(selected);
        setAndroidStep('time');
      } else {
        // 시간 선택 완료 → 저장
        setDueDate(selected);
        setShowPicker(false);
      }
    } else {
      // iOS: 값이 바뀔 때마다 tempDate 업데이트 (모달 확인 전)
      if (selected) setTempDate(selected);
    }
  };

  // iOS 전용 — 모달 "확인"
  const handleIOSConfirm = () => {
    setDueDate(tempDate);
    setShowPicker(false);
  };

  // iOS 전용 — 모달 "취소"
  const handleIOSCancel = () => {
    setShowPicker(false);
  };

  // ─── 유효성 검사 ─────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!title.trim()) return '제목을 입력해주세요.';
    if (!selectedClassId) return '반을 선택해주세요.';
    if (!dueDate) return '마감일을 선택해주세요.';
    return null;
  };

  // ─── 출제 ────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    const error = validate();
    if (error) { Alert.alert('입력 오류', error); return; }
    if (!user?.uid || !dueDate) return;

    setIsLoading(true);
    try {
      await addDoc(Collections.homeworks(), {
        title: title.trim(),
        content: content.trim(),
        class_id: selectedClassId,
        due_date: Timestamp.fromDate(dueDate),
        created_by: user.uid,
      });
      // 숙제 목록 화면으로 복귀
      router.back();
    } catch (e) {
      console.error('[HomeworkCreate] 출제 실패:', e);
      Alert.alert('오류', '숙제 출제에 실패했어요. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  const dDay = dueDate ? calcDDay(dueDate) : null;
  const canSubmit = !!title.trim() && !!selectedClassId && !!dueDate && !isLoading;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* ── 헤더 ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>숙제 출제</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── 제목 ── */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>
            제목 <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="숙제 제목을 입력해주세요"
            placeholderTextColor="#94A3B8"
            value={title}
            onChangeText={setTitle}
            returnKeyType="next"
          />
        </View>

        {/* ── 내용 ── */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>내용</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="숙제 내용이나 안내사항을 입력해주세요"
            placeholderTextColor="#94A3B8"
            value={content}
            onChangeText={setContent}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* ── 반 선택 ── */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>
            반 선택 <Text style={styles.required}>*</Text>
          </Text>
          {classes.length === 0 ? (
            <View style={styles.emptyClass}>
              <Text style={styles.emptyClassText}>등록된 반이 없어요</Text>
            </View>
          ) : (
            <View style={styles.classChips}>
              {classes.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.classChip,
                    selectedClassId === c.id && styles.classChipActive,
                  ]}
                  onPress={() => setSelectedClassId(c.id)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.classChipText,
                      selectedClassId === c.id && styles.classChipTextActive,
                    ]}
                  >
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ── 마감일 — 달력 버튼 ── */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>
            마감일 <Text style={styles.required}>*</Text>
          </Text>
          <TouchableOpacity
            style={[styles.dateBtn, dueDate && styles.dateBtnSelected]}
            onPress={openPicker}
            activeOpacity={0.8}
          >
            <Ionicons
              name="calendar-outline"
              size={18}
              color={dueDate ? '#5B50E8' : '#94A3B8'}
            />
            <Text style={[styles.dateBtnText, dueDate && styles.dateBtnTextSelected]}>
              {dueDate ? formatDateTime(dueDate) : '날짜 및 시간을 선택해주세요'}
            </Text>
          </TouchableOpacity>

          {/* D-Day 표시 */}
          {dDay !== null && (
            <Text style={[styles.dDayText, dDay < 0 && styles.dDayPast]}>
              {dDay === 0
                ? '⚠️ 오늘 마감'
                : dDay > 0
                  ? `D-${dDay} · ${dDay}일 후 마감`
                  : `마감일이 지났어요 (${Math.abs(dDay)}일 전)`}
            </Text>
          )}
        </View>

        {/* ── 출제하기 버튼 ── */}
        <TouchableOpacity
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          onPress={handleCreate}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>출제하기</Text>
          )}
        </TouchableOpacity>

      </ScrollView>

      {/* ── iOS 달력 모달 ── */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={showPicker}
          transparent
          animationType="slide"
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              {/* 핸들바 */}
              <View style={styles.modalHandle} />

              {/* 타이틀 + 버튼 바 */}
              <View style={styles.modalBar}>
                <TouchableOpacity onPress={handleIOSCancel} style={styles.modalSideBtn}>
                  <Text style={styles.modalCancel}>취소</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>마감일 선택</Text>
                <TouchableOpacity onPress={handleIOSConfirm} style={styles.modalSideBtn}>
                  <Text style={styles.modalConfirm}>확인</Text>
                </TouchableOpacity>
              </View>

              {/* 달력 — width: '100%'로 중앙 정렬 */}
              {/* 날짜 + 시간 통합 선택 */}
              <View style={styles.calendarWrapper}>
                <DateTimePicker
                  value={tempDate}
                  mode="datetime"
                  display="inline"
                  minimumDate={new Date()}
                  onChange={handleDateChange}
                  locale="ko-KR"
                  accentColor="#5B50E8"
                  themeVariant="light"
                  style={styles.datePicker}
                />
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Android 네이티브 날짜/시간 선택 (순차 2단계) ── */}
      {Platform.OS === 'android' && showPicker && (
        <DateTimePicker
          value={tempDate}
          mode={androidStep}
          display={androidStep === 'date' ? 'calendar' : 'clock'}
          minimumDate={androidStep === 'date' ? new Date() : undefined}
          onChange={handleDateChange}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  // ── 헤더 ──
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
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },

  // ── 폼 ──
  content: { padding: 20, gap: 20, paddingBottom: 40 },
  fieldGroup: { gap: 6 },
  label: { fontSize: 12, fontWeight: '700', color: '#475569' },
  required: { color: '#EF4444' },

  input: {
    backgroundColor: '#F1F0FB',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#0F172A',
  },
  inputMultiline: { minHeight: 100, paddingTop: 14 },

  // ── 반 선택 칩 ──
  classChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  classChip: {
    paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  classChipActive: { backgroundColor: '#EEEDF9', borderColor: '#5B50E8' },
  classChipText: { fontSize: 14, fontWeight: '700', color: '#334155' },
  classChipTextActive: { color: '#5B50E8' },
  emptyClass: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, alignItems: 'center' },
  emptyClassText: { fontSize: 14, color: '#94A3B8' },

  // ── 날짜 선택 버튼 ──
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F1F0FB',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  dateBtnSelected: { borderColor: '#5B50E8', backgroundColor: '#EEEDF9' },
  dateBtnText: { fontSize: 16, color: '#94A3B8', fontWeight: '500' },
  dateBtnTextSelected: { color: '#5B50E8', fontWeight: '700' },

  // D-Day
  dDayText: { fontSize: 13, fontWeight: '600', color: '#5B50E8', marginTop: 4 },
  dDayPast: { color: '#EF4444' },

  // ── 출제 버튼 ──
  submitBtn: {
    height: 52, borderRadius: 14,
    backgroundColor: '#5B50E8',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // ── iOS 달력 모달 ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 36,
    overflow: 'hidden',
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  modalBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  modalSideBtn: { minWidth: 44 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  modalCancel: { fontSize: 16, color: '#94A3B8', fontWeight: '600' },
  modalConfirm: { fontSize: 16, color: '#5B50E8', fontWeight: '700' },
  calendarWrapper: {
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  datePicker: {
    width: '100%',
  },
});
