/**
 * ReplayControls.jsx
 * Komponen Pemutar Replay & Kontrol Perekaman Event Sepeda (Event Replay Player)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import replayEngine from '../utils/replayEngine';

function formatTimeMs(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

export default function ReplayControls({ onReplayFrameUpdate, isMobile = false }) {
  const [isRecording, setIsRecording]   = useState(replayEngine.isRecording);
  const [isPlaying, setIsPlaying]       = useState(replayEngine.isPlaying);
  const [progress, setProgress]         = useState(0); // 0.0 sampai 1.0
  const [timeMs, setTimeMs]             = useState(0);
  const [durationMs, setDurationMs]     = useState(0);
  const [speed, setSpeed]               = useState(replayEngine.speedMultiplier);
  const [hasData, setHasData]           = useState(!!replayEngine.recordedData || !!replayEngine.loadSavedSession());
  const [eventTitle, setEventTitle]     = useState('');
  const fileInputRef = useRef(null);

  // Subscribe ke replayEngine events
  useEffect(() => {
    const unsubStarted = replayEngine.on('recording:started', () => setIsRecording(true));
    const unsubStopped = replayEngine.on('recording:stopped', (data) => {
      setIsRecording(false);
      setHasData(true);
      if (data) {
        setDurationMs(data.durationMs);
        setEventTitle(data.title);
      }
    });

    const unsubPStarted = replayEngine.on('playback:started', (data) => {
      setIsPlaying(true);
      setDurationMs(data.durationMs);
      setEventTitle(data.title);
    });
    const unsubPPaused  = replayEngine.on('playback:paused', () => setIsPlaying(false));
    const unsubPResumed = replayEngine.on('playback:resumed', () => setIsPlaying(true));
    const unsubPStopped = replayEngine.on('playback:stopped', () => {
      setIsPlaying(false);
      setProgress(0);
      setTimeMs(0);
    });

    const unsubTick = replayEngine.on('playback:tick', (data) => {
      setProgress(data.progress);
      setTimeMs(data.timeMs);
      setDurationMs(data.durationMs);
    });

    const unsubFrame = replayEngine.on('playback:frame_update', (data) => {
      onReplayFrameUpdate?.(data);
    });

    const unsubLoaded = replayEngine.on('replay:loaded', (data) => {
      setHasData(true);
      setDurationMs(data.durationMs);
      setEventTitle(data.title);
    });

    // Initial check
    const saved = replayEngine.recordedData || replayEngine.loadSavedSession();
    if (saved) {
      setHasData(true);
      setDurationMs(saved.durationMs);
      setEventTitle(saved.title);
    }

    return () => {
      unsubStarted(); unsubStopped();
      unsubPStarted(); unsubPPaused(); unsubPResumed(); unsubPStopped();
      unsubTick(); unsubFrame(); unsubLoaded();
    };
  }, [onReplayFrameUpdate]);

  // Handlers
  const handleToggleRecord = useCallback(() => {
    if (isRecording) {
      replayEngine.stopRecording();
    } else {
      replayEngine.startRecording();
    }
  }, [isRecording]);

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      replayEngine.pausePlayback();
    } else {
      if (replayEngine.recordedData) {
        replayEngine.resumePlayback();
      } else {
        replayEngine.startPlayback();
      }
    }
  }, [isPlaying]);

  const handleSeek = useCallback((e) => {
    const newProgress = parseFloat(e.target.value);
    setProgress(newProgress);
    replayEngine.seekProgress(newProgress);
  }, []);

  const handleSpeedChange = useCallback((newSpeed) => {
    setSpeed(newSpeed);
    replayEngine.setSpeed(newSpeed);
  }, []);

  const handleExport = useCallback(() => {
    replayEngine.exportJSON();
  }, []);

  const handleImportFile = useCallback((e) => {
    const file = e.target.files[0];
    if (file) {
      replayEngine.importJSON(file).then((data) => {
        replayEngine.startPlayback(data);
      }).catch((err) => {
        alert(`Gagal memuat file replay: ${err.message}`);
      });
    }
  }, []);

  return (
    <div style={{
      background: 'rgba(13, 17, 23, 0.95)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid var(--clr-border)',
      borderRadius: 'var(--radius-xl)',
      padding: isMobile ? 'var(--space-3)' : 'var(--space-4)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-3)',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      {/* Header: Title & Record Indicator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ fontSize: '1.2rem' }}>📼</span>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Replay & Recording Event
            </div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--clr-text-primary)' }}>
              {eventTitle || (hasData ? 'Rekaman Event Tersedia' : 'Belum Ada Rekaman Event')}
            </div>
          </div>
        </div>

        {/* Record & Export/Import Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {/* Button: Record */}
          <button
            onClick={handleToggleRecord}
            className={`btn btn-sm ${isRecording ? 'btn-danger' : 'btn-ghost'}`}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}
            title={isRecording ? 'Hentikan Perekaman Event' : 'Mulai Rekam Event Live'}
          >
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: isRecording ? '#ff2d55' : '#8b949e',
              animation: isRecording ? 'sos-active-pulse 1.2s ease-in-out infinite' : 'none',
            }} />
            <span>{isRecording ? '⏹ Stop Rekam' : '🔴 Rekam Event'}</span>
          </button>

          {/* Button: Unduh JSON */}
          {hasData && (
            <button
              onClick={handleExport}
              className="btn btn-ghost btn-sm"
              title="Unduh File Rekaman Event (.json)"
            >
              💾 Unduh
            </button>
          )}

          {/* Button: Upload JSON */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-ghost btn-sm"
            title="Buka File Rekaman Event (.json)"
          >
            📂 Buka Replay
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
        </div>
      </div>

      {/* Timeline Player (Tampil jika ada data rekaman) */}
      {hasData && (
        <div style={{
          background: 'var(--clr-bg-elevated)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-3)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}>

          {/* Scrubber Progress Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--clr-brand)', minWidth: 42 }}>
              {formatTimeMs(timeMs)}
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.001"
              value={progress}
              onChange={handleSeek}
              style={{
                flex: 1,
                accentColor: 'var(--clr-brand)',
                cursor: 'pointer',
                height: 6,
              }}
            />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--clr-text-muted)', minWidth: 42 }}>
              {formatTimeMs(durationMs)}
            </span>
          </div>

          {/* Play Controls & Speed Selectors */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
            {/* Play/Pause */}
            <button
              onClick={handleTogglePlay}
              className={`btn ${isPlaying ? 'btn-warning' : 'btn-primary'} btn-sm`}
              style={{ padding: '4px 16px', fontWeight: 700 }}
            >
              {isPlaying ? '⏸️ Pause' : '▶️ Play Replay'}
            </button>

            {/* Speed Multipliers */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: '10px', color: 'var(--clr-text-muted)', textTransform: 'uppercase', marginRight: 2 }}>
                Speed:
              </span>
              {[1, 2, 5, 10, 20].map((s) => (
                <button
                  key={s}
                  onClick={() => handleSpeedChange(s)}
                  style={{
                    padding: '2px 8px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: speed === s ? 700 : 400,
                    background: speed === s ? 'var(--clr-brand-dim)' : 'transparent',
                    border: `1px solid ${speed === s ? 'var(--clr-brand)' : 'var(--clr-border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    color: speed === s ? 'var(--clr-brand)' : 'var(--clr-text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
