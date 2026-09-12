import React, { useEffect, useRef } from 'react'

export function NetraHeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Ensure muted for autoplay compliance
    video.muted = true
    video.playsInline = true

    const attemptPlay = () => {
      const p = video.play()
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          // Autoplay may be temporarily blocked; retry on next interaction/visibility
        })
      }
    }

    // Initial attempt
    attemptPlay()

    // Retry when video can play
    const onCanPlay = () => attemptPlay()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && video.paused) {
        attemptPlay()
      }
    }
    // Retry on any user interaction as fallback (still no visible controls)
    const onInteraction = () => {
      if (video.paused) attemptPlay()
    }

    video.addEventListener('canplay', onCanPlay)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('click', onInteraction, { once: true })
    window.addEventListener('touchstart', onInteraction, { once: true })
    window.addEventListener('keydown', onInteraction, { once: true })

    return () => {
      video.removeEventListener('canplay', onCanPlay)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('click', onInteraction)
      window.removeEventListener('touchstart', onInteraction)
      window.removeEventListener('keydown', onInteraction)
    }
  }, [])

  return (
    <div className="panel" style={{ overflow: 'hidden' }}>
      <div className="panel-header">
        <h3>NETRA LIVE DEMONSTRATION</h3>
        <span className="panel-meta">CONTINUOUS AUTOPLAY • MUTED • LOOP • /assets/netra-hero.mp4</span>
      </div>
      <div
        style={{
          background: '#06080c',
          borderTop: '1px solid var(--border-subtle)',
          padding: 0,
          lineHeight: 0,
        }}
      >
        <video
          ref={videoRef}
          src="/assets/netra-hero.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          style={{
            display: 'block',
            width: '100%',
            height: 'auto',
            maxHeight: 520,
            aspectRatio: '16 / 9',
            objectFit: 'contain',
            background: '#06080c',
          }}
        />
      </div>
      <div
        className="mono"
        style={{
          padding: '6px 12px',
          background: 'var(--bg-surface-0)',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: 9,
          color: 'var(--text-dim)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>CONTINUOUSLY RUNNING MP4 • NO CONTROLS • LOOPING DEMONSTRATION PANEL</span>
        <span style={{ color: 'var(--text-muted)' }}>PRIMARY VISUAL ARTIFACT</span>
      </div>
    </div>
  )
}
