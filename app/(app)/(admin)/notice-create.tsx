/**
 * app/(app)/(admin)/notice-create.tsx — admin 공지 작성 화면
 *
 * 제목 / 내용 입력 + 중요 공지 토글 + 공지 대상(전체/반 선택) + 저장 버튼.
 * admin은 학원 전체 반에서 선택 가능.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../store/useAuthStore';
import { createNotice, uploadNoticeAttachment, type PendingNoticeAttachment } from '../../../lib/notice';
import { Collections } from '../../../lib/firestore';
import { strings } from '../../../constants/strings';
import ClassPickerSheet from '../../../components/ClassPickerSheet';
import NoticeAttachmentPicker from '../../../components/NoticeAttachmentPicker';
import type { Class, NoticeAttachment } from '../../../types';

// 수신 역할 옵션
type TargetRoleOption = 'all' | 'student' | 'parent';

export default function AdminNoticeCreateScreen() {
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [title, setTitle]             = useState('');
  const [content, setContent]         = useState('');
  const [isImportant, setIsImportant] = useState(false);
  const [saving, setSaving]           = useState(false);

  // ── 공지 대상 반 ──
  const [targetAll, setTargetAll]               = useState(true);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);

  // ── 수신 역할 ── ('all' = 학생+학부모 모두)
  const [targetRole, setTargetRole] = useState<TargetRoleOption>('all');

  // ── 학원 전체 반 목록 ──
  const [classes, setClasses] = useState<Class[]>([]);

  // ── 첨부파일 (업로드 전 로컬 정보) ──
  const [pendingAttachments, setPendingAttachments] = useState<PendingNoticeAttachment[]>([]);

  // 학원 전체 반 로드
  useEffect(() => {
    if (!user?.academy_id) return;

    Collections.classes()
      .where('academy_id', '==', user.academy_id)
      .get()
      .then((snap) => {
        setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Class)));
      })
      .catch((e) => console.warn('[AdminNoticeCreate] 반 로드 오류:', e));
  }, [user?.academy_id]);

  // 저장 버튼 활성 조건
  const canSave =
    title.trim().length > 0 &&
    (targetAll || selectedClassIds.length > 0);

  // targetRole → Firestore 저장용 배열로 변환
  function resolveTargetRoles(): string[] {
    if (targetRole === 'student') return ['student'];
    if (targetRole === 'parent')  return ['parent'];
    return []; // 'all' → 빈 배열 = 모두
  }

  // ── 공지 저장 ──
  const handleSave = async () => {
    if (!canSave || saving || !user?.academy_id || !user?.uid) return;

    setSaving(true);
    try {
      // 첨부파일 업로드 — Storage 경로용 임시 ID 사전 발급
      const uploaded: NoticeAttachment[] = [];
      if (pendingAttachments.length > 0) {
        const tempId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        for (const f of pendingAttachments) {
          const meta = await uploadNoticeAttachment(user.academy_id, tempId, f);
          uploaded.push(meta);
        }
      }

      await createNotice({
        title: title.trim(),
        content: content.trim(),
        isImportant,
        academyId: user.academy_id,
        createdBy: user.uid,
        targetClassIds: targetAll ? [] : selectedClassIds,
        targetRoles: resolveTargetRoles(),
        attachments: uploaded,
      });
      // router.back()이 스택이 비어있을 때 에러를 던지는 케이스 방어
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(app)/(admin)/(tabs)/notices');
      }
    } catch (e) {
      console.error('[AdminNoticeCreate] 공지 저장 실패:', e);
      Alert.alert('', strings.common.error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── 헤더 ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/(admin)/(tabs)/notices')}
          activeOpacity={0.7}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{strings.notice.createTitle}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── 중요 공지 토글 ── */}
        <TouchableOpacity
          style={[styles.importantToggle, isImportant && styles.importantToggleActive]}
          onPress={() => setIsImportant((prev) => !prev)}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isImportant ? 'alert-circle' : 'alert-circle-outline'}
            size={18}
            color={isImportant ? '#fff' : '#64748B'}
          />
          <Text style={[styles.importantToggleText, isImportant && styles.importantToggleTextActive]}>
            {strings.notice.importantToggle}
          </Text>
          {isImportant && (
            <Ionicons name="checkmark" size={16} color="#fff" style={styles.checkIcon} />
          )}
        </TouchableOpacity>

        {/* ── 수신 역할 선택 ── */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>{strings.notice.targetRoleLabel}</Text>
          <View style={styles.roleRow}>
            {(['all', 'student', 'parent'] as TargetRoleOption[]).map((opt) => {
              const label =
                opt === 'all'     ? strings.notice.targetRoleAll :
                opt === 'student' ? strings.notice.targetRoleStudentOnly :
                                    strings.notice.targetRoleParentOnly;
              const active = targetRole === opt;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[styles.roleChip, active && styles.roleChipActive]}
                  onPress={() => setTargetRole(opt)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.roleChipText, active && styles.roleChipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── 공지 대상 반 ── */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>{strings.notice.targetLabel}</Text>
          <ClassPickerSheet
            mode="multi"
            classes={classes}
            targetAll={targetAll}
            selectedIds={selectedClassIds}
            onChangeAll={setTargetAll}
            onChangeIds={setSelectedClassIds}
          />
          {!targetAll && selectedClassIds.length === 0 && (
            <Text style={styles.targetHint}>{strings.notice.targetNoneSelected}</Text>
          )}
        </View>

        {/* ── 제목 입력 ── */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>제목</Text>
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder={strings.notice.titlePlaceholder}
            placeholderTextColor="#94A3B8"
            maxLength={100}
            returnKeyType="next"
          />
        </View>

        {/* ── 내용 입력 ── */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>내용</Text>
          <TextInput
            style={styles.contentInput}
            value={content}
            onChangeText={setContent}
            placeholder={strings.notice.contentPlaceholder}
            placeholderTextColor="#94A3B8"
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* ── 첨부파일 ── */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>첨부파일</Text>
          <NoticeAttachmentPicker
            attachments={pendingAttachments}
            onChange={setPendingAttachments}
          />
        </View>

      </ScrollView>

      {/* ── 하단 저장 버튼 ── */}
      <View style={styles.bottomWrapper}>
        <TouchableOpacity
          style={[styles.saveBtn, (!canSave || saving) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave || saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>{strings.notice.saveButton}</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },

  scrollContent: { padding: 20, gap: 20, paddingBottom: 16 },

  importantToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F1F5F9', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 16,
    borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  importantToggleActive: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  importantToggleText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#64748B' },
  importantToggleTextActive: { color: '#fff' },
  checkIcon: { marginLeft: 'auto' },

  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 14, fontWeight: '700', color: '#0F172A' },

  // ── 수신 역할 칩 ──
  roleRow: { flexDirection: 'row', gap: 8 },
  roleChip: {
    flex: 1, paddingVertical: 11, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC', alignItems: 'center',
  },
  roleChipActive: { backgroundColor: '#5B50E8', borderColor: '#5B50E8' },
  roleChipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  roleChipTextActive: { color: '#fff' },

  targetHint: { fontSize: 12, color: '#EF4444', marginTop: 6 },

  titleInput: {
    backgroundColor: '#F1F0FB', borderWidth: 1.5, borderColor: '#E2E8F0',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: '#0F172A',
  },
  contentInput: {
    backgroundColor: '#F1F0FB', borderWidth: 1.5, borderColor: '#E2E8F0',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: '#0F172A', height: 200,
  },

  bottomWrapper: {
    paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: '#E2E8F0',
  },
  saveBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#5B50E8', borderRadius: 14, height: 52,
  },
  saveBtnDisabled: { backgroundColor: '#E2E8F0' },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
