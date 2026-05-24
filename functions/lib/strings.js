"use strict";
// Cloud Functions에서 사용하는 한국어 알림 메시지 상수
// 앱과 별도로 관리 (서버/클라이언트 분리)
Object.defineProperty(exports, "__esModule", { value: true });
exports.NOTIFICATION_MESSAGES = void 0;
exports.NOTIFICATION_MESSAGES = {
    // 숙제 신규 등록 알림 — 학생·학부모 공용 (양식 B: 제목 단일, 본문에 반·제목·마감일)
    homeworkCreated: {
        title: '새 숙제가 등록됐어요',
        // 예: "수학반 · 기출문제 1단원 · 8/30(금)까지"
        body: (className, homeworkTitle, dueLabel) => `${className} · ${homeworkTitle} · ${dueLabel}까지`,
    },
    // 마감 전날 알림
    homeworkDueReminder: {
        title: (homeworkTitle) => `📚 내일 마감: ${homeworkTitle}`,
        body: '내일까지 숙제를 제출해야 해요. 서두르세요!',
    },
    // 피드백 알림 (학생용)
    feedbackStudent: {
        title: (homeworkTitle) => `✅ 숙제 피드백: ${homeworkTitle}`,
        body: (feedback) => feedback === '👍' ? '선생님이 숙제에 👍 을 남겼어요!' : '선생님이 숙제에 💧 을 남겼어요. 확인해보세요!',
    },
    // 학생 숙제 제출 알림 (학부모용)
    // 자녀가 숙제를 제출했을 때 학부모에게 발송 — 재제출(update)에는 발송하지 않음
    homeworkSubmittedParent: {
        title: (studentName) => `📨 ${studentName} 학생이 숙제를 제출했어요`,
        // 예: "수학반 · 기출문제 1단원"
        body: (className, homeworkTitle) => `${className} · ${homeworkTitle}`,
    },
    // 피드백 알림 (학부모용)
    feedbackParent: {
        title: (homeworkTitle) => `✅ 자녀 숙제 피드백: ${homeworkTitle}`,
        body: (feedback) => feedback === '👍' ? '선생님이 자녀 숙제에 👍 을 남겼어요!' : '선생님이 자녀 숙제에 💧 을 남겼어요.',
    },
    // 당일 미제출 학부모 알림
    unsubmittedAlert: {
        title: (homeworkTitle) => `⚠️ 오늘 마감: ${homeworkTitle}`,
        body: (studentName) => `${studentName} 학생이 아직 숙제를 제출하지 않았어요.`,
    },
    // 공지 알림
    noticeAlert: {
        title: (noticeTitle) => `📢 새 공지: ${noticeTitle}`,
        body: '공지사항을 확인해보세요.',
    },
    // 공지 미확인자 재알림 (admin이 수동 발송)
    noticeReminder: {
        title: (noticeTitle) => `🔔 미확인 공지: ${noticeTitle}`,
        body: '아직 확인하지 않은 공지가 있어요. 지금 확인해주세요.',
    },
    // 선생님 수동 숙제 알림 (학생용)
    homeworkReminderManual: {
        title: (homeworkTitle) => `📚 숙제 알림: ${homeworkTitle}`,
        body: '선생님이 숙제 제출을 요청했어요. 서둘러 제출하세요!',
    },
    // 선생님 수동 숙제 알림 (학부모용)
    homeworkReminderParent: {
        title: (homeworkTitle) => `📚 자녀 숙제 알림: ${homeworkTitle}`,
        body: (studentName) => `${studentName} 학생이 아직 숙제를 제출하지 않았어요.`,
    },
    // 출결 알림 (학부모용)
    attendanceAlert: {
        title: (studentName) => `📋 출결 알림: ${studentName}`,
        bodyAbsent: '자녀가 오늘 결석으로 처리되었어요.',
        bodyLate: '자녀가 오늘 지각으로 처리되었어요.',
    },
    // 학부모 결석 사유 등록 알림 (선생님용)
    // 학부모가 자녀의 결석 사유를 전송했을 때 담당 선생님에게 발송
    attendanceReasonForTeacher: {
        title: '결석 통보가 등록됐어요',
        // 예: "수학반 · 김민수 학생 · 가족 행사"
        body: (className, studentName, reason) => `${className} · ${studentName} 학생 · ${reason}`,
    },
};
//# sourceMappingURL=strings.js.map