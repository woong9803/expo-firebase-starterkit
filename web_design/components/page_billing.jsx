// ============================================================
// Page: Billing / Subscription
// ============================================================

const BillingPage = () => {
  const [selectedPlan, setSelectedPlan] = React.useState('pro');
  const [showPayment, setShowPayment] = React.useState(false);
  const plan = window.DATA.CURRENT_PLAN;
  const usage = plan.students / plan.limit * 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="page-header">
        <div>
          <div className="page-title">구독 / 결제</div>
          <div className="page-sub">현재 플랜 정보와 결제 내역을 확인하세요</div>
        </div>
      </div>

      {/* Current plan card */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, var(--bg-surface) 0%, var(--accent-soft) 100%)',
        overflow: 'hidden', position: 'relative',
      }}>
        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>현재 플랜</span>
                <span className="badge badge-success"><span className="dot" /> 활성</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 8 }}>
                <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em' }}>{plan.name} 플랜</div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>₩{plan.price.toLocaleString()} / 월</div>
              </div>
              <div className="small muted" style={{ marginTop: 10 }}>
                다음 결제일: <b style={{ color: 'var(--text-primary)' }}>{plan.nextBilling}</b> · {plan.card}
              </div>
            </div>

            <div style={{ minWidth: 280, flex: '0 1 auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 6 }}>
                <span>학생 수</span>
                <span><b style={{ color: 'var(--text-primary)' }}>{plan.students}</b> / {plan.limit}명</span>
              </div>
              <div style={{ height: 8, background: 'rgba(0,0,0,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${usage}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
              </div>
              <div className="small muted" style={{ marginTop: 8 }}>
                {plan.limit - plan.students}명 더 등록 가능 · 한도의 {usage.toFixed(0)}% 사용 중
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button className="btn btn-secondary btn-sm">결제 수단 변경</button>
                <button className="btn btn-primary btn-sm">플랜 업그레이드</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Plans */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, letterSpacing: '-0.02em' }}>요금제 선택</div>
        <div className="grid-3">
          {window.DATA.PLANS.map(p => {
            const isCurrent = p.current;
            const isSelected = selectedPlan === p.id;
            return (
              <div key={p.id} className="card" style={{
                position: 'relative',
                border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                boxShadow: isSelected ? 'var(--shadow-md)' : 'none',
                cursor: 'pointer',
              }} onClick={() => setSelectedPlan(p.id)}>
                {p.popular && (
                  <div style={{
                    position: 'absolute', top: -10, left: 22,
                    background: 'var(--accent)', color: 'white',
                    padding: '3px 10px', borderRadius: 4, fontSize: 10.5, fontWeight: 700,
                    letterSpacing: '0.05em', textTransform: 'uppercase',
                  }}>MOST POPULAR</div>
                )}
                <div style={{ padding: '24px 24px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</div>
                      <div className="small muted" style={{ marginTop: 3 }}>최대 {p.limit === 9999 ? '무제한' : `${p.limit}명`}</div>
                    </div>
                    {isCurrent && <span className="badge badge-accent">현재 플랜</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 16 }}>
                    <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em' }}>₩{p.price.toLocaleString()}</span>
                    <span className="small muted">/ 월</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                    {p.features.map(f => (
                      <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <Icon path={Icons.check} size={14} />
                        <span style={{ color: 'var(--text-secondary)' }}>{f}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    className={`btn ${isCurrent ? 'btn-secondary' : 'btn-primary'}`}
                    onClick={(e) => { e.stopPropagation(); if (!isCurrent) setShowPayment(true); }}
                    disabled={isCurrent}
                    style={{ width: '100%', marginTop: 20, justifyContent: 'center' }}>
                    {isCurrent ? '사용 중' : `${p.name}로 변경`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment history */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">결제 내역</div>
            <div className="card-sub">최근 6건</div>
          </div>
          <button className="btn btn-sm btn-ghost">
            <Icon path={Icons.download} size={13} /> 영수증 다운로드
          </button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>결제일</th>
              <th>내역</th>
              <th>결제 수단</th>
              <th>영수증</th>
              <th style={{ textAlign: 'right' }}>금액</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {window.DATA.PAYMENTS.map((p, i) => (
              <tr key={i}>
                <td style={{ color: 'var(--text-secondary)' }}>{p.date}</td>
                <td style={{ fontWeight: 500 }}>{p.desc}</td>
                <td className="small" style={{ color: 'var(--text-secondary)' }}>{p.method}</td>
                <td className="mono small muted">{p.invoice}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>₩{p.amount.toLocaleString()}</td>
                <td><span className="badge badge-success">완료</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showPayment && (
        <div className="modal-backdrop" onClick={() => setShowPayment(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">플랜 변경 — 결제</div>
              <button className="header-icon-btn" onClick={() => setShowPayment(false)}>
                <Icon path={Icons.close} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ padding: '14px 16px', background: 'var(--bg-subtle)', borderRadius: 10 }}>
                <div className="small muted">변경 예정 플랜</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>
                    {window.DATA.PLANS.find(p => p.id === selectedPlan)?.name} 플랜
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>
                    ₩{window.DATA.PLANS.find(p => p.id === selectedPlan)?.price.toLocaleString()} <span className="small muted" style={{ fontWeight: 400 }}>/월</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="label">카드 번호</label>
                <input className="input mono" placeholder="1234 5678 9012 3456" defaultValue="4829 **** **** ****" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="label">유효기간</label>
                  <input className="input mono" placeholder="MM / YY" defaultValue="08 / 29" />
                </div>
                <div>
                  <label className="label">CVC</label>
                  <input className="input mono" placeholder="•••" />
                </div>
              </div>
              <div>
                <label className="label">카드 소유주</label>
                <input className="input" placeholder="원용기" defaultValue="원용기" />
              </div>
              <div style={{ padding: '12px 14px', background: 'var(--accent-soft)', borderRadius: 8, fontSize: 12.5, color: 'var(--accent-text)', display: 'flex', gap: 10 }}>
                <Icon path={Icons.sparkle} size={16} />
                <div>변경 즉시 일할 계산되어 청구되며, 이전 플랜의 잔여 금액은 자동 차감됩니다.</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowPayment(false)}>취소</button>
              <button className="btn btn-primary">
                ₩{window.DATA.PLANS.find(p => p.id === selectedPlan)?.price.toLocaleString()} 결제하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

window.BillingPage = BillingPage;
