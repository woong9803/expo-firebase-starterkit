/**
 * components/ClassPickerSheet.tsx
 *
 * 반 선택 드롭다운 공통 컴포넌트.
 * 트리거 버튼("≡ 전체 ∨")을 누르면 바텀 시트가 올라온다.
 *
 * mode='single' — 숙제 출제 등 단일 반 선택 (선택 즉시 닫힘)
 * mode='multi'  — 공지 대상 등 복수 반 선택 (전체/개별 토글, 확인 버튼으로 닫힘)
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Class } from '../types';

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

interface SingleProps {
  mode: 'single';
  classes: Class[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  placeholder?: string;
}

interface MultiProps {
  mode: 'multi';
  classes: Class[];
  targetAll: boolean;
  selectedIds: string[];
  onChangeAll: (all: boolean) => void;
  onChangeIds: (ids: string[]) => void;
}

type Props = SingleProps | MultiProps;

// ─────────────────────────────────────────────────────────────
// ClassPickerSheet
// ─────────────────────────────────────────────────────────────

export default function ClassPickerSheet(props: Props) {
  const [open, setOpen] = useState(false);

  // ── 트리거에 표시할 라벨 ──
  function triggerLabel(): string {
    if (props.mode === 'single') {
      const cls = props.classes.find((c) => c.id === props.selectedId);
      return cls ? cls.name : (props.placeholder ?? '반 선택');
    }
    if (props.targetAll) return '전체';
    if (props.selectedIds.length === 0) return '반 선택';
    if (props.selectedIds.length === 1) {
      const cls = props.classes.find((c) => c.id === props.selectedIds[0]);
      return cls ? cls.name : '1개 반';
    }
    return `${props.selectedIds.length}개 반`;
  }

  // 선택 완료 여부 (트리거 색상 구분용)
  const isActive =
    props.mode === 'single'
      ? !!props.selectedId
      : props.targetAll || props.selectedIds.length > 0;

  // ── multi 모드: 개별 반 항목 토글 ──
  function handleMultiToggle(classId: string) {
    if (props.mode !== 'multi') return;
    const already = props.selectedIds.includes(classId);
    const newIds = already
      ? props.selectedIds.filter((id) => id !== classId)
      : [...props.selectedIds, classId];
    props.onChangeAll(false);
    props.onChangeIds(newIds);
  }

  return (
    <>
      {/* ── 트리거 버튼 ── */}
      <TouchableOpacity
        style={[styles.trigger, isActive && styles.triggerActive]}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
      >
        <Ionicons
          name="list-outline"
          size={15}
          color={isActive ? '#5B50E8' : '#64748B'}
        />
        <Text style={[styles.triggerText, isActive && styles.triggerTextActive]}>
          {triggerLabel()}
        </Text>
        <Ionicons
          name="chevron-down"
          size={15}
          color={isActive ? '#5B50E8' : '#64748B'}
        />
      </TouchableOpacity>

      {/* ── 바텀 시트 모달 ── */}
      <Modal visible={open} transparent animationType="slide">
        <View style={styles.modalContainer}>
          {/* 배경 터치 시 닫기 */}
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setOpen(false)}
          />

          <View style={styles.sheet}>
            {/* 핸들바 */}
            <View style={styles.handle} />

            {/* 시트 헤더 */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>반 선택</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* 목록 */}
            <ScrollView
              style={styles.list}
              showsVerticalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={styles.listContent}
            >
              {/* multi 모드에서만 "전체 반" 옵션 표시 */}
              {props.mode === 'multi' && (
                <TouchableOpacity
                  style={styles.item}
                  onPress={() => {
                    (props as MultiProps).onChangeAll(true);
                    (props as MultiProps).onChangeIds([]);
                    setOpen(false);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.itemLeft}>
                    <View style={[styles.itemDot, props.targetAll && styles.itemDotActive]} />
                    <Text style={[styles.itemText, props.targetAll && styles.itemTextActive]}>
                      전체 반
                    </Text>
                  </View>
                  {props.targetAll && (
                    <Ionicons name="checkmark" size={20} color="#5B50E8" />
                  )}
                </TouchableOpacity>
              )}

              {/* 반 목록 */}
              {props.classes.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>등록된 반이 없어요</Text>
                </View>
              ) : (
                props.classes.map((cls) => {
                  const selected =
                    props.mode === 'single'
                      ? props.selectedId === cls.id
                      : props.selectedIds.includes(cls.id);

                  return (
                    <TouchableOpacity
                      key={cls.id}
                      style={styles.item}
                      onPress={() => {
                        if (props.mode === 'single') {
                          (props as SingleProps).onSelect(cls.id);
                          setOpen(false);
                        } else {
                          handleMultiToggle(cls.id);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.itemLeft}>
                        <View style={[styles.itemDot, selected && styles.itemDotActive]} />
                        <Text style={[styles.itemText, selected && styles.itemTextActive]}>
                          {cls.name}
                        </Text>
                      </View>
                      {selected && (
                        <Ionicons name="checkmark" size={20} color="#5B50E8" />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            {/* multi 모드: 확인 버튼 */}
            {props.mode === 'multi' && (
              <View style={styles.confirmRow}>
                <TouchableOpacity
                  style={styles.confirmBtn}
                  onPress={() => setOpen(false)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.confirmBtnText}>확인</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// 스타일
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── 트리거 버튼 ──
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  triggerActive: {
    backgroundColor: '#EEEDF9',
    borderColor: '#5B50E8',
  },
  triggerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  triggerTextActive: {
    color: '#5B50E8',
  },

  // ── 모달 ──
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingBottom: 34,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },

  // ── 목록 ──
  list: { flexGrow: 0 },
  listContent: { paddingVertical: 8 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
  },
  itemDotActive: {
    backgroundColor: '#5B50E8',
  },
  itemText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#334155',
  },
  itemTextActive: {
    color: '#5B50E8',
    fontWeight: '700',
  },
  emptyBox: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
  },

  // ── 확인 버튼 (multi 모드) ──
  confirmRow: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  confirmBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#5B50E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
