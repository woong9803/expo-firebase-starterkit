import { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Collections } from '../../lib/firestore';
import { useAuthStore } from '../../store/useAuthStore';
import { Academy } from '../../types';
import { checkVersion, VersionCheckResult } from '../../lib/versionCheck';
import { safeSignOut } from '../../lib/auth';
import ForceUpdateDialog from '../../components/ForceUpdateDialog';

// app.config.ts의 version 값과 동기화 — 업데이트 시 함께 수정
const APP_VERSION = '1.0.0';

/**
 * 역할별 화면 분기 — 앱 전체에서 이 파일 단 한 곳에서만 처리
 * 개별 화면(admin/index.tsx 등)에서 role 체크 절대 금지
 */
export default function AppLayout() {
  const router = useRouter();
  const { user, academy, pendingExploreGranted, setAcademy } = useAuthStore();

  // 버전 체크 상태
  const [versionCheck, setVersionCheck] = useState<VersionCheckResult>({
    needsForceUpdate: false,
    needsRecommendUpdate: false,
    storeUrl: '',
  });

  // 앱 진입 시 1회 버전 체크
  useEffect(() => {
    checkVersion(APP_VERSION).then((result) => {
      setVersionCheck(result);
    });
  }, []);

  // admin 전용 — 학원 상태 실시간 구독
  // 로그인 중에 Firebase 콘솔에서 status가 바뀌어도 즉시 감지
  useEffect(() => {
    if (user?.role !== 'admin' || !user?.academy_id) return;

    const unsub = Collections.academy(user.academy_id).onSnapshot(
      (snap) => {
        if (snap.exists()) {
          setAcademy({ id: snap.id, ...snap.data() } as Academy);
        }
      },
      (e) => console.warn('[AppLayout] academy 구독 오류:', e),
    );
    return () => unsub();
  }, [user?.academy_id, user?.role]);

  useEffect(() => {
    if (!user) return;

    // 탈퇴 처리된 계정 — 소프트 삭제 직후 서버가 완전 삭제하기 전
    // 앱에서 즉시 로그아웃 처리하여 접근 차단
    if (user.deleted_at != null) {
      safeSignOut().catch(() => {});
      return;
    }

    // phone_verified 없음 → Firestore 문서 미완료 → phone-verify로
    if (!user.phone_verified && !user.role) {
      router.replace('/(auth)/phone-verify');
      return;
    }

    // academy_id 없음 → 온보딩 미완료 → 역할 선택부터 다시
    if (!user.academy_id) {
      router.replace('/(auth)/role-select');
      return;
    }

    // 역할에 따라 전용 홈 화면으로 이동
    switch (user.role) {
      case 'admin':
        // academy가 null이면 아직 Firestore에서 로딩 중 → 다음 effect 실행까지 대기
        if (academy === null) break;
        if (academy.status === 'pending' && !pendingExploreGranted) {
          // 승인 대기 중이고 "미리 탐색해보기"를 누르지 않은 경우 → pending 화면
          router.replace('/(auth)/pending');
        } else {
          // 승인 완료 또는 탐색 허용된 경우 → admin 홈
          router.replace('/(app)/(admin)');
        }
        break;
      case 'teacher':
        router.replace('/(app)/(teacher)');
        break;
      case 'student':
        router.replace('/(app)/(student)');
        break;
      case 'parent':
        router.replace('/(app)/(parent)');
        break;
    }
  // 의존성에 user 전체를 넣으면 notif_prefs 등 무관한 필드 변경 시에도 재실행되어
  // 현재 탭을 홈으로 강제 이동하는 버그 발생 — 라우팅 결정에 필요한 필드만 지정
  }, [user?.role, user?.academy_id, user?.phone_verified, academy?.status, pendingExploreGranted]);

  return (
    <>
      {/* (app) 레벨 Stack — 모든 역할 그룹과 common을 같은 스택에 통합
          → 학생 탭에서 common/notice-detail로 push 시 동일 Stack에 들어가
            iOS 좌→우 스와이프 백 정상 동작 */}
      <Stack
        screenOptions={{
          headerShown: false,
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}
      >
        <Stack.Screen name="(admin)" />
        <Stack.Screen name="(teacher)" />
        <Stack.Screen name="(student)" />
        <Stack.Screen name="(parent)" />
        <Stack.Screen name="common" />
      </Stack>
      {/* 강제 업데이트 다이얼로그 — 닫기 불가 */}
      <ForceUpdateDialog
        visible={versionCheck.needsForceUpdate}
        isForced={true}
        storeUrl={versionCheck.storeUrl}
      />
      {/* 권장 업데이트 다이얼로그 — 닫기 가능 */}
      <ForceUpdateDialog
        visible={versionCheck.needsRecommendUpdate}
        isForced={false}
        storeUrl={versionCheck.storeUrl}
        onDismiss={() =>
          setVersionCheck((prev) => ({ ...prev, needsRecommendUpdate: false }))
        }
      />
    </>
  );
}
