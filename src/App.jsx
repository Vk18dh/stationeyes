import React, { useState, useEffect, useRef } from 'react';
import {
  Train,
  Camera,
  Upload,
  Volume2,
  VolumeX,
  Settings,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  Compass,
  MapPin,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { performOcr, DEFAULT_OCRSPACE_KEY } from './platform/cloudOcr.js';
import { parseStationBoard, buildBoardSpeech } from './engine/stationBoardParser.js';
import { extractRailwayDetails, buildSpokenSummary } from './engine/detailExtractor.js';
import { voiceGuide } from './platform/voiceGuide.js';
import { TargetRecognitionEngine } from './engine/targetRecognitionEngine.js';
import { LiveGuideTracker, TrackerState } from './engine/liveGuideTracker.js';
import { Position, Direction, Arrow } from './engine/model.js';

export default function App() {
  // Settings
  const [ocrProvider, setOcrProvider] = useState(() => {
    return localStorage.getItem('station_eyes_ocr_provider') || 'ocrspace';
  });
  const [ocrApiKey, setOcrApiKey] = useState(() => {
    return localStorage.getItem('station_eyes_ocr_key') || '';
  });
  const [showSettings, setShowSettings] = useState(false);

  // App step: 'ticket' (Step 1) | 'station' (Step 2)
  const [step, setStep] = useState(() => {
    return localStorage.getItem('station_eyes_target') ? 'station' : 'ticket';
  });

  // Target platform
  const [targetPlatform, setTargetPlatform] = useState(() => {
    return localStorage.getItem('station_eyes_target') || '';
  });
  const [isEditingPlatform, setIsEditingPlatform] = useState(false);

  // Step 1: Ticket state
  const [ticketPhotos, setTicketPhotos] = useState([]);
  const [ticketStatus, setTicketStatus] = useState('');
  const [isProcessingTicket, setIsProcessingTicket] = useState(false);
  const [ticketDetails, setTicketDetails] = useState(null);
  const [showRawLines, setShowRawLines] = useState(false);

  // Step 2: Station navigation mode: 'menu' | 'board' | 'live'
  const [stationMode, setStationMode] = useState('menu');

  // Option 1: Board photo state
  const [boardStatus, setBoardStatus] = useState('');
  const [isProcessingBoard, setIsProcessingBoard] = useState(false);
  const [boardResult, setBoardResult] = useState(null);

  // Option 2: Live camera state
  const [liveStatus, setLiveStatus] = useState('');
  const [liveDisplay, setLiveDisplay] = useState({
    state: TrackerState.SEARCHING,
    position: Position.UNKNOWN,
    arrow: null,
    boardTitle: null,
  });

  // Camera & Stream refs
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraPurpose, setCameraPurpose] = useState('ticket'); // 'ticket' | 'board'
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const liveVideoRef = useRef(null);
  const liveStreamRef = useRef(null);
  const liveIntervalRef = useRef(null);
  const liveAnalyzingRef = useRef(false);

  const ticketFileInputRef = useRef(null);
  const boardFileInputRef = useRef(null);

  // Engine refs
  const liveTrackerRef = useRef(null);
  const engineRef = useRef(new TargetRecognitionEngine());

  // Audio state
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    voiceGuide.onStateChange = (speaking) => {
      setIsSpeaking(speaking);
    };
    return () => {
      voiceGuide.stop();
    };
  }, []);

  // Save target platform to localStorage
  const saveTargetPlatform = (p) => {
    const norm = (p || '').trim().toUpperCase();
    setTargetPlatform(norm);
    if (norm) {
      localStorage.setItem('station_eyes_target', norm);
    } else {
      localStorage.removeItem('station_eyes_target');
    }
  };

  // --------------------------------------------------------------------------
  // STEP 1: REAL TICKET OCR
  // --------------------------------------------------------------------------
  const processTicketFiles = async (files) => {
    if (!files || files.length === 0) return;
    voiceGuide.stop();
    setIsProcessingTicket(true);
    setTicketStatus(`Reading ticket using ${ocrProvider === 'ocrspace' ? 'OCR.space' : ocrProvider}...`);

    const newPhotoPreviews = [];
    const allExtractedLines = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      newPhotoPreviews.push(URL.createObjectURL(file));

      try {
        setTicketStatus(`Processing image ${i + 1} of ${files.length}...`);
        const page = await performOcr(file, {
          engine: ocrProvider,
          apiKey: ocrApiKey,
        });
        const lines = page.lines.map((l) => l.text.trim()).filter(Boolean);
        allExtractedLines.push(...lines);
      } catch (err) {
        console.error('Ticket OCR Error:', err);
      }
    }

    setTicketPhotos((prev) => [...prev, ...newPhotoPreviews]);

    const extracted = extractRailwayDetails(allExtractedLines);
    setTicketDetails(extracted);

    if (extracted.platform) {
      saveTargetPlatform(extracted.platform);
      setTicketStatus(`Target Platform ${extracted.platform} identified!`);
      voiceGuide.speak(`Target Platform identified as Platform ${extracted.platform}.`);
    } else {
      setTicketStatus('Ticket scanned. Please verify or type your platform number.');
      voiceGuide.speak('Ticket scanned. Please type or confirm your platform number.');
    }

    setIsProcessingTicket(false);
    if (ticketFileInputRef.current) ticketFileInputRef.current.value = '';
  };

  // Camera modal for ticket / board
  const openCameraModal = async (purpose) => {
    setCameraPurpose(purpose);
    setShowCameraModal(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      alert('Camera error: ' + err.message);
      setShowCameraModal(false);
    }
  };

  const closeCameraModal = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setShowCameraModal(false);
  };

  const captureCameraPhoto = async (addAnother = false) => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (cameraPurpose === 'ticket') {
      if (!addAnother) closeCameraModal();
      canvas.toBlob((blob) => {
        if (blob) processTicketFiles([blob]);
      }, 'image/jpeg');
    } else if (cameraPurpose === 'board') {
      closeCameraModal();
      canvas.toBlob((blob) => {
        if (blob) processBoardFile(blob);
      }, 'image/jpeg');
    }
  };

  // --------------------------------------------------------------------------
  // STEP 2 - OPTION 1: SNAP A BOARD
  // --------------------------------------------------------------------------
  const processBoardFile = async (file) => {
    if (!file) return;
    voiceGuide.stop();
    setIsProcessingBoard(true);
    setBoardStatus(`Reading station board using ${ocrProvider}...`);
    setBoardResult(null);

    try {
      const page = await performOcr(file, {
        engine: ocrProvider,
        apiKey: ocrApiKey,
      });
      const lines = page.lines.map((l) => l.text.trim()).filter(Boolean);
      const analysis = parseStationBoard(lines, targetPlatform);
      setBoardResult(analysis);
      setBoardStatus('');

      const speech = buildBoardSpeech(analysis);
      voiceGuide.speak(speech);
    } catch (err) {
      console.error('Board OCR Error:', err);
      setBoardStatus(`Could not read board: ${err.message}`);
    } finally {
      setIsProcessingBoard(false);
      if (boardFileInputRef.current) boardFileInputRef.current.value = '';
    }
  };

  // --------------------------------------------------------------------------
  // STEP 2 - OPTION 2: LIVE VIDEO GUIDE
  // --------------------------------------------------------------------------
  const startLiveCamera = async () => {
    setStationMode('live');
    setLiveStatus('Starting camera...');
    setLiveDisplay({
      state: TrackerState.SEARCHING,
      position: Position.UNKNOWN,
      arrow: null,
      boardTitle: null,
      distance: null,
    });

    liveTrackerRef.current = new LiveGuideTracker(targetPlatform);
    voiceGuide.speak(`Looking for Platform ${targetPlatform}. Point your phone forward as you walk.`);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      liveStreamRef.current = stream;
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        liveVideoRef.current.play();
      }
      setLiveStatus('Camera active. Analyzing station signs...');

      liveIntervalRef.current = setInterval(async () => {
        if (liveAnalyzingRef.current || !liveVideoRef.current) return;
        const video = liveVideoRef.current;
        if (video.readyState < 2) return;

        liveAnalyzingRef.current = true;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(video.videoWidth || 640, 640);
          canvas.height = Math.min(video.videoHeight || 360, 360);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          const page = await performOcr(canvas, {
            engine: ocrProvider === 'gemini' ? 'ocrspace' : ocrProvider,
            apiKey: ocrApiKey,
          });

          const boardInfo = parseStationBoard(page.lines, targetPlatform);
          const analysis = engineRef.current.analyze(page, targetPlatform);
          const update = liveTrackerRef.current.onFrame(analysis.target, Date.now());

          if (update.speech) {
            const speechText =
              boardInfo.distance && boardInfo.targetFound
                ? `${update.speech} It is ${boardInfo.distance} away.`
                : update.speech;
            voiceGuide.speak(speechText);
          }

          setLiveDisplay({
            ...update.display,
            boardTitle: boardInfo.boardTitle || null,
            distance: boardInfo.distance || null,
          });
        } catch (err) {
          // frame drops
        } finally {
          liveAnalyzingRef.current = false;
        }
      }, 900);
    } catch (err) {
      alert('Could not start live camera: ' + err.message);
      stopLiveCamera();
    }
  };

  const stopLiveCamera = () => {
    if (liveIntervalRef.current) {
      clearInterval(liveIntervalRef.current);
      liveIntervalRef.current = null;
    }
    if (liveStreamRef.current) {
      liveStreamRef.current.getTracks().forEach((t) => t.stop());
      liveStreamRef.current = null;
    }
    setStationMode('menu');
    voiceGuide.stop();
  };

  const startOver = () => {
    voiceGuide.stop();
    setTicketPhotos([]);
    setTicketDetails(null);
    saveTargetPlatform('');
    setStep('ticket');
    setStationMode('menu');
    setBoardResult(null);
  };

  return (
    <div className="app-container">
      {/* Top Application Bar */}
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">
            <Train size={24} />
          </div>
          <div>
            <h1 className="brand-title">Station Eyes</h1>
            <p className="brand-sub">Indian Railways Assistant</p>
          </div>
        </div>

        <div className="header-actions">
          {targetPlatform && step === 'station' && (
            <span className="target-badge">PF {targetPlatform}</span>
          )}

          {isSpeaking ? (
            <button
              className="icon-btn"
              onClick={() => voiceGuide.stop()}
              title="Stop Voice"
              style={{ color: 'var(--yellow)', borderColor: 'var(--yellow)' }}
            >
              <VolumeX size={20} />
            </button>
          ) : (
            <button
              className="icon-btn"
              onClick={() => {
                if (targetPlatform) {
                  voiceGuide.speak(`Your destination is Platform ${targetPlatform}.`);
                } else {
                  voiceGuide.speak('Please upload your train ticket to begin.');
                }
              }}
              title="Voice Status"
            >
              <Volume2 size={20} />
            </button>
          )}

          <button
            className="icon-btn"
            onClick={() => setShowSettings(true)}
            title="OCR Settings"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>OCR Engine Settings</h3>
              <button className="icon-btn" onClick={() => setShowSettings(false)}>
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '6px' }}>
                OCR Provider:
              </label>
              <select
                value={ocrProvider}
                onChange={(e) => {
                  setOcrProvider(e.target.value);
                  localStorage.setItem('station_eyes_ocr_provider', e.target.value);
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  background: 'var(--surface-hover)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  fontSize: '15px',
                }}
              >
                <option value="ocrspace">OCR.space Free Cloud API (Recommended)</option>
                <option value="gemini">Google Gemini 1.5 Flash (AI Multimodal)</option>
                <option value="tesseract">Local Tesseract.js (Offline in Browser)</option>
              </select>
            </div>

            {ocrProvider === 'ocrspace' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '6px' }}>
                  OCR.space API Key:
                </label>
                <input
                  type="text"
                  value={ocrApiKey}
                  onChange={(e) => {
                    setOcrApiKey(e.target.value);
                    localStorage.setItem('station_eyes_ocr_key', e.target.value);
                  }}
                  placeholder={DEFAULT_OCRSPACE_KEY + ' (Free key)'}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '10px',
                    background: 'var(--surface-hover)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    fontSize: '15px',
                  }}
                />
                <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                  Leave blank to use pre-configured free key.
                </small>
              </div>
            )}

            {ocrProvider === 'gemini' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '6px' }}>
                  Gemini API Key:
                </label>
                <input
                  type="password"
                  value={ocrApiKey}
                  onChange={(e) => {
                    setOcrApiKey(e.target.value);
                    localStorage.setItem('station_eyes_ocr_key', e.target.value);
                  }}
                  placeholder="Paste your free key from Google AI Studio"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '10px',
                    background: 'var(--surface-hover)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    fontSize: '15px',
                  }}
                />
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--blue)', fontSize: '13px', display: 'inline-block', marginTop: '4px' }}
                >
                  Get free key from Google AI Studio ↗
                </a>
              </div>
            )}

            <button className="btn btn-primary" onClick={() => setShowSettings(false)}>
              Save & Close
            </button>
          </div>
        </div>
      )}

      {/* Camera Capture Modal */}
      {showCameraModal && (
        <div className="modal-overlay">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--yellow)' }}>
              {cameraPurpose === 'ticket' ? 'Scan Train Ticket' : 'Scan Station Route Board'}
            </h3>
            <button className="icon-btn" onClick={closeCameraModal}>
              <X size={20} />
            </button>
          </div>

          <div className="camera-viewport">
            <video ref={videoRef} playsInline autoPlay muted className="camera-video" />
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {cameraPurpose === 'ticket' ? (
              <>
                <button className="btn btn-secondary" onClick={() => captureCameraPhoto(true)}>
                  📸 Snap & Add Another
                </button>
                <button className="btn btn-primary" onClick={() => captureCameraPhoto(false)}>
                  ✓ Snap & Finish
                </button>
              </>
            ) : (
              <button className="btn btn-primary" onClick={() => captureCameraPhoto(false)}>
                📸 Capture Sign
              </button>
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* STEP 1: SCAN TRAIN TICKET                                          */}
      {/* ================================================================== */}
      {step === 'ticket' && (
        <main>
          <div className="card">
            <h2 className="card-title">
              <MapPin size={22} color="var(--yellow)" />
              Step 1: Your Train Ticket
            </h2>
            <p className="card-desc">
              Photograph or upload your ticket. The app will read your destination platform number and journey details.
            </p>

            <div className="action-grid">
              <button className="btn btn-primary" onClick={() => openCameraModal('ticket')}>
                <Camera size={20} />
                <span>Take Photo</span>
              </button>

              <button className="btn btn-secondary" onClick={() => ticketFileInputRef.current?.click()}>
                <Upload size={20} />
                <span>Upload Photos</span>
              </button>
            </div>

            <input
              type="file"
              ref={ticketFileInputRef}
              accept="image/*"
              multiple
              onChange={(e) => processTicketFiles(e.target.files)}
              style={{ display: 'none' }}
            />
          </div>

          {/* Processing Indicator */}
          {isProcessingTicket && (
            <div className="card" style={{ textAlign: 'center', padding: '24px' }}>
              <div className="spinner" style={{ marginBottom: '12px' }}></div>
              <div style={{ fontSize: '17px', fontWeight: 700 }}>Reading Ticket...</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '4px 0 0 0' }}>
                {ticketStatus}
              </p>
            </div>
          )}

          {/* Extracted Ticket Details */}
          {ticketDetails && !isProcessingTicket && (
            <div>
              {/* Highlight Destination Platform Board */}
              <div className="platform-board">
                <div className="platform-board-sub">Your Destination</div>
                <div className="platform-board-num">
                  {targetPlatform ? `Platform ${targetPlatform}` : 'Not Specified'}
                </div>

                {!isEditingPlatform ? (
                  <button
                    className="platform-board-edit"
                    onClick={() => setIsEditingPlatform(true)}
                  >
                    ✏️ {targetPlatform ? 'Change Number' : 'Set Platform Number'}
                  </button>
                ) : (
                  <div style={{ marginTop: '8px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <input
                      type="text"
                      value={targetPlatform}
                      onChange={(e) => saveTargetPlatform(e.target.value)}
                      placeholder="e.g. 3"
                      style={{
                        padding: '6px 12px',
                        fontSize: '18px',
                        fontWeight: 900,
                        width: '100px',
                        borderRadius: '8px',
                        border: '2px solid #000',
                        textAlign: 'center',
                      }}
                    />
                    <button
                      className="platform-board-edit"
                      onClick={() => setIsEditingPlatform(false)}
                    >
                      ✓ Done
                    </button>
                  </div>
                )}
              </div>

              {/* Journey details pill grid */}
              <div className="card">
                <h3 className="card-title" style={{ fontSize: '16px' }}>
                  Ticket Information
                </h3>

                <div className="details-grid">
                  {ticketDetails.trainNumber && (
                    <div className="detail-pill">
                      <div className="detail-pill-label">Train No.</div>
                      <div className="detail-pill-val">{ticketDetails.trainNumber}</div>
                    </div>
                  )}
                  {ticketDetails.coachSeat && (
                    <div className="detail-pill">
                      <div className="detail-pill-label">Coach / Seat</div>
                      <div className="detail-pill-val">{ticketDetails.coachSeat}</div>
                    </div>
                  )}
                  {ticketDetails.pnr && (
                    <div className="detail-pill">
                      <div className="detail-pill-label">PNR</div>
                      <div className="detail-pill-val">{ticketDetails.pnr}</div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '12px', fontSize: '15px' }}
                    onClick={() =>
                      voiceGuide.speak(
                        `${buildSpokenSummary(ticketDetails)} Your target is set to Platform ${targetPlatform}.`
                      )
                    }
                  >
                    <Volume2 size={18} />
                    <span>Listen to Ticket</span>
                  </button>
                </div>
              </div>

              {/* Proceed to Step 2 Button */}
              <button
                className="btn btn-primary"
                style={{ padding: '18px 24px', fontSize: '19px', marginBottom: '16px' }}
                onClick={() => {
                  if (!targetPlatform) {
                    alert('Please enter or confirm a target platform number.');
                    return;
                  }
                  setStep('station');
                  setStationMode('menu');
                  voiceGuide.speak(
                    `Target Platform ${targetPlatform} set. You are now inside the train station. Choose: Check Station Sign or Start Live Video Guide.`
                  );
                }}
              >
                <span>Enter Station (Target: Platform {targetPlatform || '?'})</span>
                <ArrowRight size={22} />
              </button>
            </div>
          )}
        </main>
      )}

      {/* ================================================================== */}
      {/* STEP 2: STATION NAVIGATION (Target Platform active)                */}
      {/* ================================================================== */}
      {step === 'station' && stationMode === 'menu' && (
        <main>
          {/* Target destination bar */}
          <div className="platform-board" style={{ padding: '16px' }}>
            <div className="platform-board-sub">Current Destination</div>
            <div className="platform-board-num" style={{ fontSize: '48px', margin: '4px 0' }}>
              Platform {targetPlatform}
            </div>
          </div>

          {/* Option 1: Snap a Sign */}
          <div className="card">
            <h2 className="card-title">
              <Camera size={22} color="var(--yellow)" />
              Option 1: Check Station Route Board
            </h2>
            <p className="card-desc">
              Take a photo of any platform route sign board or billboard. The app reads all board names and tells you if Platform {targetPlatform} is there and which direction to take.
            </p>
            <button className="btn btn-primary" onClick={() => setStationMode('board')}>
              <Camera size={20} />
              <span>Check Station Sign</span>
            </button>
          </div>

          {/* Option 2: Live Video Guide */}
          <div className="card">
            <h2 className="card-title">
              <Compass size={22} color="var(--blue)" />
              Option 2: Live Video Guide
            </h2>
            <p className="card-desc">
              Point your camera forward as you walk. Hands-free voice guidance and visual arrows notify you whenever Platform {targetPlatform} appears on a sign.
            </p>
            <button className="btn btn-blue" onClick={startLiveCamera}>
              <Compass size={20} />
              <span>Start Live Video Guide</span>
            </button>
          </div>

          {/* Secondary Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
            <button
              className="btn btn-outline"
              style={{ width: 'auto', padding: '10px 18px', fontSize: '14px' }}
              onClick={() => setStep('ticket')}
            >
              <ArrowLeft size={16} />
              <span>Back to Ticket</span>
            </button>
            <button
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--red)',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer',
              }}
              onClick={startOver}
            >
              Clear & New Ticket
            </button>
          </div>
        </main>
      )}

      {/* ================================================================== */}
      {/* OPTION 1 DETAIL: SNAP A BOARD PHOTO & CHECK PATH                   */}
      {/* ================================================================== */}
      {step === 'station' && stationMode === 'board' && (
        <main>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Check Station Sign</h2>
            <button className="btn btn-secondary" style={{ width: 'auto', padding: '8px 14px' }} onClick={() => setStationMode('menu')}>
              ✕ Back
            </button>
          </div>

          <div className="card">
            <p className="card-desc">
              Point your camera at any platform route board or billboard for <strong>Platform {targetPlatform}</strong>.
            </p>

            <div className="action-grid">
              <button className="btn btn-primary" onClick={() => openCameraModal('board')}>
                <Camera size={20} />
                <span>Take Photo of Sign</span>
              </button>

              <button className="btn btn-secondary" onClick={() => boardFileInputRef.current?.click()}>
                <Upload size={20} />
                <span>Upload Sign Photo</span>
              </button>
            </div>

            <input
              type="file"
              ref={boardFileInputRef}
              accept="image/*"
              onChange={(e) => processBoardFile(e.target.files?.[0])}
              style={{ display: 'none' }}
            />
          </div>

          {isProcessingBoard && (
            <div className="card" style={{ textAlign: 'center', padding: '24px' }}>
              <div className="spinner" style={{ marginBottom: '12px' }}></div>
              <div style={{ fontSize: '17px', fontWeight: 700 }}>Analyzing Station Sign...</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '4px 0 0 0' }}>
                {boardStatus}
              </p>
            </div>
          )}

          {/* Board Result Card */}
          {boardResult && !isProcessingBoard && (
            <div>
              {/* Target Status Banner */}
              {boardResult.targetFound ? (
                <div className="result-banner result-banner-found">
                  <div style={{ fontSize: '13px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Destination Found
                  </div>
                  <div className="result-arrow">
                    {boardResult.targetDirection === Direction.STRAIGHT
                      ? '↑'
                      : boardResult.targetDirection === Direction.LEFT
                      ? '←'
                      : boardResult.targetDirection === Direction.RIGHT
                      ? '→'
                      : '✓'}
                  </div>
                  <div className="result-headline">{boardResult.pathInstruction}</div>
                  <p style={{ margin: '8px 0 0 0', fontWeight: 700, fontSize: '15px' }}>
                    Follow this sign for Platform {targetPlatform}
                  </p>

                  {boardResult.distance && (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        backgroundColor: '#000000',
                        color: 'var(--yellow)',
                        border: '2px solid var(--yellow)',
                        borderRadius: '24px',
                        padding: '8px 18px',
                        marginTop: '12px',
                        fontSize: '18px',
                        fontWeight: 900,
                      }}
                    >
                      <span>📏 Distance: {boardResult.distance}</span>
                      {boardResult.walkingTime && (
                        <span style={{ color: '#ffffff', fontSize: '14px', fontWeight: 600 }}>
                          • {boardResult.walkingTime}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="result-banner result-banner-wrong">
                  <div style={{ fontSize: '40px', lineHeight: 1 }}>⛔</div>
                  <div className="result-headline" style={{ margin: '10px 0 6px 0' }}>
                    Not for Platform {targetPlatform}
                  </div>
                  <p style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                    {boardResult.allPlatforms.length > 0
                      ? `This board leads to Platform ${boardResult.allPlatforms.join(' & ')}.`
                      : 'Platform not found on this sign. Try another sign.'}
                  </p>
                  {boardResult.distance && (
                    <div style={{ marginTop: '10px', fontSize: '15px', color: 'var(--text-muted)' }}>
                      📏 Distance on sign: <strong>{boardResult.distance}</strong>
                    </div>
                  )}
                </div>
              )}

              {/* Board Details Card */}
              <div className="card">
                <div style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Sign Board Details
                </div>
                <h3 style={{ fontSize: '20px', fontWeight: 800, margin: '4px 0 10px 0' }}>
                  {boardResult.boardTitle || 'Station Sign'}
                </h3>

                {boardResult.distance && (
                  <div
                    style={{
                      backgroundColor: 'rgba(255, 204, 0, 0.1)',
                      border: '1px solid var(--yellow)',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      marginBottom: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.05em' }}>
                        DISTANCE TO PLATFORM
                      </div>
                      <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--yellow)', marginTop: '2px' }}>
                        📏 {boardResult.distance}
                      </div>
                    </div>
                    {boardResult.walkingTime && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.05em' }}>
                          WALKING TIME
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', marginTop: '2px' }}>
                          ⏱ {boardResult.walkingTime}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {boardResult.facilities.length > 0 && (
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px' }}>
                      Places & Facilities on Sign:
                    </div>
                    <div className="badge-list">
                      {boardResult.facilities.map((fac, idx) => (
                        <span key={idx} className="facility-badge">
                          🏛 {fac}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {boardResult.allPlatforms.length > 0 && (
                  <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700 }}>
                      All Platforms Mentioned:
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)', marginTop: '2px' }}>
                      Platform {boardResult.allPlatforms.join(', ')}
                    </div>
                  </div>
                )}

                <button
                  className="btn btn-primary"
                  style={{ marginTop: '16px' }}
                  onClick={() => voiceGuide.speak(buildBoardSpeech(boardResult))}
                >
                  <Volume2 size={20} />
                  <span>Listen to Guidance Again</span>
                </button>
              </div>

              {/* Raw lines collapsible */}
              <div className="card" style={{ padding: '14px' }}>
                <button
                  onClick={() => setShowRawLines(!showRawLines)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <span>All OCR Text Lines ({boardResult.cleanLines.length})</span>
                  {showRawLines ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>

                {showRawLines && (
                  <ol style={{ paddingLeft: '20px', margin: '12px 0 0 0', color: 'var(--text)', fontSize: '14px' }}>
                    {boardResult.cleanLines.map((line, idx) => (
                      <li key={idx} style={{ marginBottom: '6px' }}>
                        {line}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}
        </main>
      )}

      {/* ================================================================== */}
      {/* OPTION 2 DETAIL: LIVE VIDEO GUIDE                                  */}
      {/* ================================================================== */}
      {step === 'station' && stationMode === 'live' && (
        <div style={{ position: 'relative', width: '100%', height: '82vh', borderRadius: '20px', overflow: 'hidden' }}>
          <video ref={liveVideoRef} playsInline autoPlay muted className="camera-video" />

          {/* Top Bar */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              padding: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)',
              zIndex: 10,
            }}
          >
            <button className="btn btn-secondary" style={{ width: 'auto', padding: '8px 14px' }} onClick={stopLiveCamera}>
              ✕ Stop Guide
            </button>
            <span className="target-badge">Destination: PF {targetPlatform}</span>
          </div>

          {/* Live HUD at bottom */}
          <div
            className="live-hud"
            onClick={() => {
              if (liveDisplay.state === TrackerState.TRACKING) {
                voiceGuide.speak(
                  `${liveDisplay.boardTitle ? liveDisplay.boardTitle + '. ' : ''}` +
                    `Platform ${targetPlatform} is ` +
                    (liveDisplay.position === Position.LEFT
                      ? 'to your left'
                      : liveDisplay.position === Position.RIGHT
                      ? 'to your right'
                      : 'straight ahead') +
                    (liveDisplay.distance ? `. Distance is ${liveDisplay.distance}.` : '')
                );
              } else {
                voiceGuide.speak(`Looking for Platform ${targetPlatform}. Walk slowly.`);
              }
            }}
          >
            <div className="live-hud-arrow">
              {liveDisplay.state === TrackerState.TRACKING
                ? liveDisplay.position === Position.LEFT
                  ? '←'
                  : liveDisplay.position === Position.RIGHT
                  ? '→'
                  : '↑'
                : liveDisplay.state === TrackerState.LOST
                ? '?'
                : '◎'}
            </div>

            <div className="live-hud-text">
              <div className="live-hud-title">
                {liveDisplay.state === TrackerState.TRACKING
                  ? liveDisplay.position === Position.LEFT
                    ? 'Go Left (←)'
                    : liveDisplay.position === Position.RIGHT
                    ? 'Go Right (→)'
                    : 'Go Straight Ahead (↑)'
                  : liveDisplay.state === TrackerState.LOST
                  ? `Lost Platform ${targetPlatform}`
                  : `Looking for Platform ${targetPlatform}...`}
                {liveDisplay.distance && liveDisplay.state === TrackerState.TRACKING && (
                  <span style={{ fontSize: '15px', color: 'var(--yellow)', marginLeft: '8px', fontWeight: 900 }}>
                    📏 {liveDisplay.distance}
                  </span>
                )}
              </div>
              <div className="live-hud-sub">
                {liveDisplay.distance ? `📏 ${liveDisplay.distance} • ` : ''}
                {liveDisplay.boardTitle ? `🏛 ${liveDisplay.boardTitle} • ` : ''}
                Tap box to hear guidance again
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
