"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashForLog = hashForLog;
const crypto_1 = require("crypto");
/**
 * 로그 기록용 단방향 해시
 *
 * 목적:
 *  - uid·code 같은 개인 식별 가능 값을 평문으로 GCP Logging에 남기지 않음
 *  - 같은 원본 → 같은 해시이므로 트러블슈팅(유저 단위 추적)은 가능
 *  - 해시는 역산 불가 — 로그가 외부로 유출되어도 원본 PII 복원 불가
 *
 * 개인정보보호법 관점:
 *  - 로그 보존 기간(GCP 기본 30일 이상)에 대응
 *  - 삭제권 행사 시 "해당 uid의 로그만 지워달라" 요청이 와도 해시이므로
 *    전체 로그 접근 없이 추적 목적만 유지
 *
 * 구현:
 *  - SHA-256 앞 12자리 (충돌률 매우 낮고 로그 가독성 확보)
 */
function hashForLog(value) {
    if (!value)
        return '(empty)';
    return (0, crypto_1.createHash)('sha256').update(value).digest('hex').slice(0, 12);
}
//# sourceMappingURL=hash.js.map