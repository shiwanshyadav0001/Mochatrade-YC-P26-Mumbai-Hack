import React, { useState } from 'react'
import type { RecoveryRequestResponse, Trader } from '../types'

interface AccountRecoveryModalProps {
  trader?: Trader
  onClose: () => void
  onRequestRecovery: (traderId: string, channel: string) => Promise<RecoveryRequestResponse>
  onVerifyRecovery: (traderId: string, code: string) => Promise<void>
}

export function AccountRecoveryModal({
  trader,
  onClose,
  onRequestRecovery,
  onVerifyRecovery,
}: AccountRecoveryModalProps) {
  const [channel, setChannel] = useState<'EMAIL_OTP' | 'SMS_OTP' | 'SECONDARY_KYC'>('EMAIL_OTP')
  const [stage, setStage] = useState<'REQUEST' | 'VERIFY'>('REQUEST')
  const [recoveryData, setRecoveryData] = useState<RecoveryRequestResponse | null>(null)
  const [otpCode, setOtpCode] = useState('849201')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (!trader) return null

  const handleRequest = async () => {
    setLoading(true)
    try {
      const res = await onRequestRecovery(trader.trader_id, channel)
      setRecoveryData(res)
      setOtpCode(res.demo_code || '849201')
      setStage('VERIFY')
      setMessage(res.instructions)
    } catch (err: any) {
      setMessage(`Request failed: ${err.message || 'Error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async () => {
    setLoading(true)
    try {
      await onVerifyRecovery(trader.trader_id, otpCode)
      setMessage('Account successfully recovered! Session restored to Monitored standing.')
      setTimeout(() => {
        onClose()
      }, 1400)
    } catch (err: any) {
      setMessage(`Recovery verification failed: ${err.message || 'Invalid code'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-surface-1)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          width: 480,
          maxWidth: '90vw',
          padding: 20,
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, color: '#60a5fa' }}>
              PROTOCOL P-04 // ACCOUNT RECOVERY & REMEDIATION
            </h3>
            <span className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)' }}>
              REMEDIAL WORKFLOW FOR TRADER #{trader.trader_id} ({trader.name})
            </span>
          </div>
          <button className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: 9 }} onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={{ padding: '10px 12px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)', marginBottom: 14 }}>
          <p style={{ fontSize: 10, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
            Out-of-band identity recovery provides secondary verification evidence to restore restricted standing. Trust is restored evidence-grounded without erasing historical risk records.
          </p>
        </div>

        {stage === 'REQUEST' ? (
          <div>
            <label className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>
              SELECT RECOVERY CHANNEL:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6, marginBottom: 14 }}>
              {[
                { id: 'EMAIL_OTP', label: 'Registered Email Address (t***@mochatrade.io)', sub: '6-digit cryptographic OTP token' },
                { id: 'SMS_OTP', label: 'Registered Phone SMS (+91 ***-***-7842)', sub: 'Out-of-band cellular challenge' },
                { id: 'SECONDARY_KYC', label: 'Secondary KYC Document & Video Verification', sub: 'Manual identity compliance bypass' },
              ].map(c => (
                <button
                  key={c.id}
                  type="button"
                  className={`btn ${channel === c.id ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: 10, padding: '8px 10px', textAlign: 'left' }}
                  onClick={() => setChannel(c.id as any)}
                >
                  <div>{c.label}</div>
                  <span style={{ fontSize: 8.5, color: 'var(--text-dim)', display: 'block', marginTop: 2 }}>{c.sub}</span>
                </button>
              ))}
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '8px', fontSize: 10.5, fontWeight: 700 }}
              onClick={handleRequest}
              disabled={loading}
            >
              DISPATCH RECOVERY CHALLENGE →
            </button>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 14 }}>
              <label className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                ENTER 6-DIGIT VERIFICATION CODE:
              </label>
              <input
                type="text"
                value={otpCode}
                onChange={e => setOtpCode(e.target.value)}
                placeholder="849201"
                className="mono"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg-surface-0)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  color: '#fff',
                  fontSize: 16,
                  fontWeight: 700,
                  letterSpacing: '4px',
                  textAlign: 'center',
                }}
              />
              <span className="mono" style={{ fontSize: 8.5, color: 'var(--text-dim)', display: 'block', marginTop: 4, textAlign: 'center' }}>
                DEMO PRE-FILLED CODE: {recoveryData?.demo_code || '849201'}
              </span>
            </div>

            {message && (
              <div style={{ padding: '8px 10px', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid var(--accent-blue)', borderRadius: 'var(--radius-xs)', fontSize: 10, color: '#93c5fd', marginBottom: 14 }}>
                {message}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button
                className="btn btn-secondary"
                style={{ padding: '6px', fontSize: 9.5 }}
                onClick={() => setStage('REQUEST')}
                disabled={loading}
              >
                ← BACK
              </button>
              <button
                className="btn btn-primary"
                style={{ padding: '6px', fontSize: 10, fontWeight: 700 }}
                onClick={handleVerify}
                disabled={loading}
              >
                VERIFY & RESTORE →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
