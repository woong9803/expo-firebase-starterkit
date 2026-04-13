/**
 * app/(app)/(parent)/notices.tsx — 학부모 공지사항 탭
 *
 * common/notice-list.tsx 래핑. 작성 버튼 없음.
 */

import React from 'react';
import NoticeListScreen from '../common/notice-list';

export default function ParentNoticesScreen() {
  return <NoticeListScreen />;
}
