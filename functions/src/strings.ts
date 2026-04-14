// Cloud Functions에서 사용하는 한국어 알림 메시지 상수
// 앱과 별도로 관리 (서버/클라이언트 분리)

export const NOTIFICATION_MESSAGES = {
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
};
