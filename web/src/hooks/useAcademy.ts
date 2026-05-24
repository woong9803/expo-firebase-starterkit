import { useMutation, useQueryClient } from '@tanstack/react-query';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { useEffect } from 'react';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';
import type { Academy, AcademyType } from '../../../types/index';

// ─── 학원 정보 실시간 동기화 ──────────────────────────────────
/**
 * 현재 학원 문서를 onSnapshot으로 구독해 useAuthStore.academy 갱신
 * - 다른 곳에서 학원 정보가 바뀌어도 즉시 반영
 * - 컴포넌트 마운트 시 자동 구독, 언마운트 시 해제
 */
export function useAcademyRealtime() {
  const { academy, setAcademy } = useAuthStore();
  const academyId = academy?.id ?? null;

  useEffect(() => {
    if (!academyId) return;
    const ref = doc(db, 'academies', academyId);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setAcademy({ id: snap.id, ...snap.data() } as Academy);
      }
    });
    return () => unsub();
  }, [academyId, setAcademy]);
}

// ─── 학원 정보 수정 ───────────────────────────────────────────
/**
 * 학원 정보 수정 — Firestore Rules 화이트리스트:
 *   name · academy_type · owner_name · owner_phone · address
 * (status === 'active' 일 때만 허용)
 */
export interface UpdateAcademyInput {
  name?: string;
  academy_type?: AcademyType;
  owner_name?: string;
  owner_phone?: string;
  address?: string;
}

export function useUpdateAcademy() {
  const { academy } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateAcademyInput) => {
      if (!academy?.id) throw new Error('학원 정보를 찾을 수 없어요');

      // 빈 객체 방지 — 변경된 필드만 업데이트
      const payload: Record<string, string> = {};
      if (input.name !== undefined) payload.name = input.name.trim();
      if (input.academy_type !== undefined) payload.academy_type = input.academy_type;
      if (input.owner_name !== undefined) payload.owner_name = input.owner_name.trim();
      if (input.owner_phone !== undefined) payload.owner_phone = input.owner_phone.trim();
      if (input.address !== undefined) payload.address = input.address.trim();

      if (Object.keys(payload).length === 0) {
        throw new Error('변경된 내용이 없어요');
      }

      await updateDoc(doc(db, 'academies', academy.id), payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academy'] });
    },
  });
}
