/**
 * app/(app)/(teacher)/notices.tsx — 선생님 공지사항 탭
 *
 * common/notice-list.tsx를 래핑.
 * showCreateButton=true 로 '+' 버튼 표시, 탭 시 notice-create 화면으로 이동.
 */

import React from 'react';
import { router } from 'expo-router';

import NoticeListScreen from '../../common/notice-list';

export default function TeacherNoticesScreen() {
  return (
    <NoticeListScreen
      showCreateButton
      showEditButtons
      onCreatePress={() => router.push('/(app)/(teacher)/notice-create')}
    />
  );
}
