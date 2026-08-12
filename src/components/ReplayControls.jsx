/**
 * ReplayControls.jsx
 * Komponen Pemutar Replay & Kontrol Perekaman Event Sepeda (Event Replay Player)
 * Responsive design — bebas overflow di layar HP & Desktop
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import replayEngine from '../utils/replayEngine';
import screenRecorder from '../utils/screenRecorder';

function formatTimeMs(ms) {
  if (!ms || isNaN(ms)) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

export default function ReplayControls({ onReplayFrameUpdate, _isMobile = false }) {
  const [isRecording, setIsRecording]             = useState(replayEngine.isRecording);
  const [isVideoRecording, setIsVideoRecording] = useState(screenRecorder.isRecordingVideo);
  const [videoElapsedMs, setVideoElapsedMs]     = useState(0);
  const [isPlaying, setIsPlaying]                 = useState(replayEngine.isPlaying);
  const [progress, setProgress]                   = useState(0);
  const [timeMs, setTimeMs]                       = useState(0);
  const [durationMs, setDurationMs]               = useState(0);
  const [speed, setSpeed]                         = useState(replayEngine.speedMultiplier);
  const [hasData, setHasData]                     = useState(!!replayEngine.recordedData || !!replayEngine.loadSavedSession());
  const [eventTitle, setEventTitle]               = useState('');
  const fileInputRef = useRef(null);

  // Subscribe ke replayEngine & screenRecorder events
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

    // Subscribe ke screenRecorder events
    const unsubVStart = screenRecorder.on('video:started', () => setIsVideoRecording(true));
    const unsubVTick  = screenRecorder.on('video:tick', ({ elapsedMs }) => setVideoElapsedMs(elapsedMs));
    const unsubVStop  = screenRecorder.on('video:stopped', () => setIsVideoRecording(false));
    const unsubVComp  = screenRecorder.on('video:completed', () => setIsVideoRecording(false));

    return () => {
      unsubStarted(); unsubStopped();
      unsubPStarted(); unsubPPaused(); unsubPResumed(); unsubPStopped();
      unsubTick(); unsubFrame(); unsubLoaded();
      unsubVStart(); unsubVTick(); unsubVStop(); unsubVComp();
    };
  }, [onReplayFrameUpdate]);

  // Handlers
  const handleToggleVideoRecording = useCallback(async () => {
    if (isVideoRecording) {
      screenRecorder.stopScreenRecording();
    } else {
      await screenRecorder.startScreenRecording();
    }
  }, [isVideoRecording]);

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

  const handleStopPlay = useCallback(() => {
    replayEngine.stopPlayback();
  }, []);

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
      background: 'var(--clr-bg-card)',
      border: '1px solid var(--clr-border)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-4)',
      boxShadow: 'var(--shadow-md)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-4)',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      {/* ── Section Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(0, 198, 255, 0.12)',
            border: '1px solid rgba(0, 198, 255, 0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.2rem', flexShrink: 0,
          }}>
            📼
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: 'var(--clr-brand)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Replay & Recording Event
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-secondary)', marginTop: 2 }}>
              {eventTitle || (hasData ? 'File Rekaman Tersedia' : 'Rekam data atau upload file .json')}
            </div>
          </div>
        </div>

        {/* Live Active Indicators */}
        {(isRecording || isVideoRecording) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 10px',
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.4)',
            borderRadius: 'var(--radius-full)',
            color: 'var(--clr-danger)',
            fontSize: '10px', fontWeight: 800,
            flexShrink: 0,
          }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%', background: 'var(--clr-danger)',
              animation: 'sos-active-pulse 1s ease-in-out infinite',
            }} />
            <span>{isRecording ? 'DATA REC' : 'VIDEO REC'}</span>
          </div>
        )}
      </div>

      {/* ── 2-Column Action Buttons (No Overflow) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
        {/* Button 1: Rekam Data Event */}
        <button
          onClick={handleToggleRecord}
          className={`btn btn-sm ${isRecording ? 'btn-danger' : 'btn-ghost'}`}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: 'var(--space-2) var(--space-3)',
            fontSize: 'var(--text-xs)', fontWeight: 700,
            background: isRecording ? 'rgba(244, 63, 94, 0.25)' : 'var(--clr-bg-elevated)',
            border: `1px solid ${isRecording ? 'var(--clr-danger)' : 'var(--clr-border)'}`,
            color: isRecording ? '#ff4d6d' : 'var(--clr-text-primary)',
          }}
          title={isRecording ? 'Hentikan Perekaman Data Event' : 'Mulai Rekam Data Pergerakan GPS Event'}
        >
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: isRecording ? '#ff4d6d' : '#8b949e',
            animation: isRecording ? 'sos-active-pulse 1s ease-in-out infinite' : 'none',
          }} />
          <span>{isRecording ? 'Stop Data' : '🔴 Rekam Data'}</span>
        </button>

        {/* Button 2: Rekam Video Layar */}
        <button
          onClick={handleToggleVideoRecording}
          className={`btn btn-sm ${isVideoRecording ? 'btn-danger' : 'btn-ghost'}`}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: 'var(--space-2) var(--space-3)',
            fontSize: 'var(--text-xs)', fontWeight: 700,
            background: isVideoRecording ? 'rgba(244, 63, 94, 0.25)' : 'rgba(0, 198, 255, 0.1)',
            border: `1px solid ${isVideoRecording ? 'var(--clr-danger)' : 'rgba(0, 198, 255, 0.35)'}`,
            color: isVideoRecording ? '#ff4d6d' : 'var(--clr-brand)',
          }}
          title={isVideoRecording ? 'Hentikan & Unduh Video Layar' : 'Rekam Video Layar Peta HD (.WebM / MP4)'}
        >
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: isVideoRecording ? '#ff4d6d' : 'var(--clr-brand)',
            animation: isVideoRecording ? 'sos-active-pulse 1s ease-in-out infinite' : 'none',
          }} />
          <span>{isVideoRecording ? `Stop Video (${formatTimeMs(videoElapsedMs)})` : '📹 Rekam Video'}</span>
        </button>

        {/* Button 3: Buka File Replay JSON */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="btn btn-ghost btn-sm"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: 'var(--space-2) var(--space-3)',
            fontSize: 'var(--text-xs)', fontWeight: 600,
            background: 'var(--clr-bg-elevated)',
            border: '1px solid var(--clr-border)',
            color: 'var(--clr-text-secondary)',
          }}
          title="Buka File Rekaman Event (.json)"
        >
          <span>📂 Buka Replay</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />

        {/* Button 4: Unduh Data Replay JSON (jika ada data) */}
        {hasData ? (
          <button
            onClick={handleExport}
            className="btn btn-ghost btn-sm"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: 'var(--space-2) var(--space-3)',
              fontSize: 'var(--text-xs)', fontWeight: 700,
              background: 'rgba(74, 222, 128, 0.1)',
              border: '1px solid rgba(74, 222, 128, 0.35)',
              color: 'var(--clr-accent)',
            }}
            title="Unduh File Rekaman Event (.json)"
          >
            <span>💾 Unduh .json</span>
          </button>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', color: 'var(--clr-text-muted)',
            background: 'var(--clr-bg-elevated)', borderRadius: 'var(--radius-sm)',
            border: '1px dashed var(--clr-border)', padding: 'var(--space-2)',
          }}>
            Belum Ada Data
          </div>
        )}
      </div>

      {/* ── Timeline Player Section ── */}
      {hasData && (
        <div style={{
          background: 'var(--clr-bg-elevated)',
          border: '1px solid var(--clr-border)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-3)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}>
          {/* Progress Scrubber */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--clr-brand)', fontWeight: 700, minWidth: 42, textAlign: 'right' }}>
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

          {/* Player Controls & Speed Selectors */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {/* Play / Pause / Stop */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <button
                onClick={handleTogglePlay}
                className={`btn btn-sm ${isPlaying ? 'btn-warning' : 'btn-primary'}`}
                style={{
                  padding: '4px 14px',
                  fontWeight: 800,
                  fontSize: 'var(--text-xs)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {isPlaying ? '⏸️ Pause' : '▶️ Play Replay'}
              </button>

              {isPlaying && (
                <button
                  onClick={handleStopPlay}
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '4px 10px', fontSize: 'var(--text-xs)', color: 'var(--clr-danger)' }}
                  title="Hentikan Replay"
                >
                  ⏹ Stop
                </button>
              )}
            </div>

            {/* Speed Multipliers */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: '10px', color: 'var(--clr-text-muted)', fontWeight: 600, textTransform: 'uppercase', marginRight: 2 }}>
                Speed:
              </span>
              {[1, 2, 5, 10, 20].map((s) => (
                <button
                  key={s}
                  onClick={() => handleSpeedChange(s)}
                  style={{
                    padding: '2px 6px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: speed === s ? 800 : 500,
                    background: speed === s ? 'var(--clr-brand-dim)' : 'transparent',
                    border: `1px solid ${speed === s ? 'var(--clr-brand)' : 'var(--clr-border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    color: speed === s ? 'var(--clr-brand)' : 'var(--clr-text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
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

