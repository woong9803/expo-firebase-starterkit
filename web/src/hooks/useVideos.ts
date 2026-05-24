/**
 * web/src/hooks/useVideos.ts
 *
 * 학습 영상 관리 페이지용 훅 모음.
 * - useClassesForVideo: 학원의 반 목록 (필터·등록 시 선택용)
 * - useVideos: 영상 실시간 구독 (반 30개씩 청크로 in 쿼리)
 * - useUpsertVideo: 영상 등록·수정 mutation
 * - useDeleteVideo: 영상 삭제 mutation
 *
 * 영상은 무료 학원에서도 "조회"는 가능하지만 "쓰기"는 보안 규칙에서
 * 유료 플랜만 허용되므로, UI 잠금은 페이지에서 plan !== 'free'로 체크한다.
 */

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';
import type { Class, Video } from '../../../types/index';

// ── 1) 반 목록 조회 (영상 필터·등록 시 사용) ────────────────────────
export function useClassesForVideo(): { classes: Class[]; isLoading: boolean } {
  const { user } = useAuthStore();
  const [classes, setClasses] = useState<Class[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user?.academy_id) return;
    setIsLoading(true);
    getDocs(
      query(collection(db, 'classes'), where('academy_id', '==', user.academy_id))
    )
      .then((snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Class));
        // 반 이름 가나다순 정렬
        list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
        setClasses(list);
      })
      .finally(() => setIsLoading(false));
  }, [user?.academy_id]);

  return { classes, isLoading };
}

// ── 2) 영상 실시간 구독 ──────────────────────────────────────────────
// 학원 내 모든 영상을 created_at desc로 가져온 뒤 화면에서 반별 필터링.
// Firestore의 in 쿼리는 30개 제한 — 반이 30개 초과하면 청크로 나눠 합친다.
export function useVideos(classIds: string[]): { videos: Video[]; isLoading: boolean; error: boolean } {
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (classIds.length === 0) {
      setVideos([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(false);

    // 30개 단위 청크로 분할
    const chunks: string[][] = [];
    for (let i = 0; i < classIds.length; i += 30) {
      chunks.push(classIds.slice(i, i + 30));
    }

    // 청크별 결과 누적용 맵 (videoId → Video)
    const accumulated = new Map<string, Video>();
    const unsubs: Array<() => void> = [];
    let pendingFirstSnap = chunks.length;

    chunks.forEach((chunk, idx) => {
      const q = query(
        collection(db, 'videos'),
        where('class_id', 'in', chunk),
        orderBy('created_at', 'desc'),
      );
      const unsub = onSnapshot(
        q,
        (snap) => {
          // 이 청크에 해당하는 영상은 일단 모두 제거 후 다시 채움
          // (한 영상은 하나의 class_id만 가지므로 청크 간 중복 없음)
          for (const [vid, v] of accumulated) {
            if (chunk.includes(v.class_id)) accumulated.delete(vid);
          }
          snap.docs.forEach((d) => {
            accumulated.set(d.id, { id: d.id, ...d.data() } as Video);
          });

          // 합쳐서 created_at desc 정렬
          const merged = Array.from(accumulated.values()).sort((a, b) => {
            const ta = a.created_at?.toMillis?.() ?? 0;
            const tb = b.created_at?.toMillis?.() ?? 0;
            return tb - ta;
          });
          setVideos(merged);

          // 모든 청크의 첫 스냅이 도착하면 로딩 종료
          if (pendingFirstSnap > 0) {
            pendingFirstSnap -= 1;
            if (pendingFirstSnap === 0) setIsLoading(false);
          }
        },
        (e) => {
          console.error(`[useVideos] 영상 구독 실패 (chunk ${idx}):`, e);
          setError(true);
          setIsLoading(false);
        }
      );
      unsubs.push(unsub);
    });

    return () => unsubs.forEach((u) => u());
  }, [classIds.join('|')]);

  return { videos, isLoading, error };
}

// ── 3) 영상 등록·수정 mutation ──────────────────────────────────────
export interface UpsertVideoInput {
  id?: string;            // 있으면 수정, 없으면 신규
  title: string;
  youtube_url: string;
  video_id: string;
  class_id: string;
}

export function useUpsertVideo() {
  const { user } = useAuthStore();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpsertVideoInput) => {
      if (!user?.uid || !user?.academy_id) {
        throw new Error('인증 정보가 없어요');
      }

      if (input.id) {
        // 수정 — 보안 규칙상 academy_id·created_by 변경 금지
        await updateDoc(doc(db, 'videos', input.id), {
          title: input.title.trim(),
          youtube_url: input.youtube_url.trim(),
          video_id: input.video_id,
          class_id: input.class_id,
        });
      } else {
        // 신규 — admin uid를 created_by에 기록
        await addDoc(collection(db, 'videos'), {
          title: input.title.trim(),
          youtube_url: input.youtube_url.trim(),
          video_id: input.video_id,
          class_id: input.class_id,
          academy_id: user.academy_id,
          created_by: user.uid,
          created_at: serverTimestamp(),
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['videos'] });
    },
  });
}

// ── 4) 영상 삭제 mutation ────────────────────────────────────────────
export function useDeleteVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (videoId: string) => {
      await deleteDoc(doc(db, 'videos', videoId));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['videos'] });
    },
  });
}
