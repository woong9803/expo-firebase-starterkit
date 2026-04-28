// Cloud Functions에서 사용하는 한국어 알림 메시지 상수
// 앱과 별도로 관리 (서버/클라이언트 분리)

export const NOTIFICATION_MESSAGES = {
  // 숙제 신규 등록 알림 — 학생·학부모 공용 (양식 B: 제목 단일, 본문에 반·제목·마감일)
  homeworkCreated: {
    title: '새 숙제가 등록됐어요',
    // 예: "수학반 · 기출문제 1단원 · 8/30(금)까지"
    body: (className: string, homeworkTitle: string, dueLabel: string) =>
      `${className} · ${homeworkTitle} · ${dueLabel}까지`,
  },

  // 마감 전날 알림
  homeworkDueReminder: {
    title: (homeworkTitle: string) => `📚 내일 마감: ${homeworkTitle}`,
    body: '내일까지 숙제를 제출해야 해요. 서두르세요!',
  },

  // 피드백 알림 (학생용)
  feedbackStudent: {
    title: (homeworkTitle: string) => `✅ 숙제 피드백: ${homeworkTitle}`,
    body: (feedback: string) =>
      feedback === '👍' ? '선생님이 숙제에 👍 을 남겼어요!' : '선생님이 숙제에 💧 을 남겼어요. 확인해보세요!',
  },

  // 피드백 알림 (학부모용)
  feedbackParent: {
    title: (homeworkTitle: string) => `✅ 자녀 숙제 피드백: ${homeworkTitle}`,
    body: (feedback: string) =>
      feedback === '👍' ? '선생님이 자녀 숙제에 👍 을 남겼어요!' : '선생님이 자녀 숙제에 💧 을 남겼어요.',
  },

  // 당일 미제출 학부모 알림
  unsubmittedAlert: {
    title: (homeworkTitle: string) => `⚠️ 오늘 마감: ${homeworkTitle}`,
    body: (studentName: string) => `${studentName} 학생이 아직 숙제를 제출하지 않았어요.`,
  },

  // 공지 알림
  noticeAlert: {
    title: (noticeTitle: string) => `📢 새 공지: ${noticeTitle}`,
    body: '공지사항을 확인해보세요.',
  },

  // 선생님 수동 숙제 알림 (학생용)
  homeworkReminderManual: {
    title: (homeworkTitle: string) => `📚 숙제 알림: ${homeworkTitle}`,
    body: '선생님이 숙제 제출을 요청했어요. 서둘러 제출하세요!',
  },

  // 선생님 수동 숙제 알림 (학부모용)
  homeworkReminderParent: {
    title: (homeworkTitle: string) => `📚 자녀 숙제 알림: ${homeworkTitle}`,
    body: (studentName: string) => `${studentName} 학생이 아직 숙제를 제출하지 않았어요.`,
  },

  // 출결 알림 (학부모용)
  attendanceAlert: {
    title: (studentName: string) => `📋 출결 알림: ${studentName}`,
    bodyAbsent: '자녀가 오늘 결석으로 처리되었어요.',
    bodyLate: '자녀가 오늘 지각으로 처리되었어요.',
  },
};
