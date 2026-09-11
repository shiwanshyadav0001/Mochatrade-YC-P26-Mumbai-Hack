import React, { useState } from 'react'
import type { Trader } from '../types'

interface StepUpVerificationModalProps {
  trader?: Trader
  onClose: () => void
  onVerify: (traderId: string, verificationType: string, status: 'SUCCESS' | 'FAILED' | 'UNAVAILABLE' | 'TIMEOUT') => Promise<void>
}

export function StepUpVerificationModal({
  trader,
  onClose,
  onVerify,
}: StepUpVerificationModalProps) {
  const [verificationType, setVerificationType] = useState<string>('PASSKEY')
  const [verifying, setVerifying] = useState(false)
  const [resultMsg, setResultMsg] = useState<string | null>(null)

  if (!trader) return null

  const handleExecute = async (status: 'SUCCESS' | 'FAILED' | 'UNAVAILABLE' | 'TIMEOUT') => {
    setVerifying(true)
    try {
      await onVerify(trader.trader_id, verificationType, status)
      setResultMsg(`Step-up verification challenge completed with status: ${status}`)
      setTimeout(() => {
        onClose()
      }, 1200)
    } catch (err: any) {
      setResultMsg(`Challenge error: ${err.message || 'Execution failed'}`)
    } finally {
      setVerifying(false)
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
            <h3 style={{ margin: 0, fontSize: 14, color: '#fff' }}>
              STEP-UP IDENTITY VERIFICATION
            </h3>
            <span className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)' }}>
              TARGET: TRADER #{trader.trader_id} ({trader.name})
            </span>
          </div>
          <button className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: 9 }} onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={{ padding: '10px 12px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4 }}>
            <span style={{ color: 'var(--text-dim)' }}>CURRENT TRUST SCORE:</span>
            <strong className="mono" style={{ color: trader.trust_score < 40 ? 'var(--state-critical)' : 'var(--state-normal)' }}>
              {trader.trust_score.toFixed(1)} / 100
            </strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
            <span style={{ color: 'var(--text-dim)' }}>SESSION RISK STATE:</span>
            <strong className="mono" style={{ color: '#fff' }}>
              {trader.session_risk_state || 'SESSION_NORMAL'}
            </strong>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>
            SELECT VERIFICATION MECHANISM:
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              { id: 'PASSKEY', label: 'FIDO2 / WebAuthn Passkey' },
              { id: '2FA_BIOMETRIC', label: 'FaceID / TouchID Biometric' },
              { id: 'HARDWARE_KEY', label: 'YubiKey Hardware Token' },
              { id: 'VIDEO_KYC', label: 'Live Video Biometric KYC' },
              { id: 'SMS_OTP', label: 'SMS One-Time Password' },
              { id: 'TOTP', label: 'Authenticator App (TOTP)' },
            ].map(m => (
              <button
                key={m.id}
                type="button"
                className={`btn ${verificationType === m.id ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: 9.5, padding: '6px 8px', textAlign: 'left' }}
                onClick={() => setVerificationType(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {resultMsg && (
          <div style={{ padding: '8px 10px', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid var(--accent-blue)', borderRadius: 'var(--radius-xs)', fontSize: 10, color: '#93c5fd', marginBottom: 14 }}>
            {resultMsg}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            className="btn btn-primary"
            style={{ padding: '8px', fontSize: 10.5, fontWeight: 700 }}
            onClick={() => handleExecute('SUCCESS')}
            disabled={verifying}
          >
            SIMULATE USER VERIFICATION: SUCCESS →
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button
              className="btn btn-secondary"
              style={{ padding: '6px', fontSize: 9.5, color: 'var(--state-critical)', borderColor: 'var(--state-critical-border)' }}
              onClick={() => handleExecute('FAILED')}
              disabled={verifying}
            >
              SIMULATE FAILURE
            </button>
            <button
              className="btn btn-secondary"
              style={{ padding: '6px', fontSize: 9.5, color: '#fbbf24' }}
              onClick={() => handleExecute('UNAVAILABLE')}
              disabled={verifying}
            >
              HARDWARE UNAVAILABLE
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
