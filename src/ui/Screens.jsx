import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  PlatformBoard,
  BigButton,
  OutlineButton,
  ScreenColumn,
  Heading,
  Body,
  CheckingOverlay,
} from './Components.jsx';
import { Palette } from './theme.js';
import { PlatformParser } from '../engine/platformParser.js';
import { LiveGuideTracker, TrackerState } from '../engine/liveGuideTracker.js';
import { SnapInterpreter, SnapOutcomeType } from '../engine/snapInterpreter.js';
import { Position, Direction, Arrow, OcrPage, OcrLine, Box } from '../engine/model.js';
import { Phrases } from '../engine/phrases.js';
import { voiceGuide } from '../platform/voiceGuide.js';
import { haptics } from '../platform/haptics.js';
import { recognizeImage } from '../platform/ocr.js';

// ============================================================================
// Camera View Component (Webcam wrapper with canvas capture)
// ============================================================================
function CameraView({ onStreamReady, videoRef, className = '' }) {
  const [error, setError] = useState(null);

  useEffect(() => {
    let currentStream = null;
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        currentStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        if (onStreamReady) onStreamReady(stream);
      } catch (err) {
        console.warn('Camera access error:', err);
        setError('Camera permission needed or camera unavailable.');
      }
    };

    startCamera();

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [videoRef, onStreamReady]);

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-zinc-900 text-white">
        <span className="text-5xl mb-4">📷</span>
        <div className="text-xl font-bold mb-2">Camera Unavailable</div>
        <p className="text-zinc-400 max-w-sm mb-4">{error}</p>
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full overflow-hidden bg-black flex items-center justify-center ${className}`}>
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        className="w-full h-full object-cover"
      />
    </div>
  );
}

// ============================================================================
// 1. TICKET SCREEN
// ============================================================================
export function TicketScreen({ vm }) {
  const fileInputRef = useRef(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    vm.processTicketFile(file);
  };

  const useSampleTicket = (samplePlatform) => {
    vm.processSampleTicket(samplePlatform);
  };

  return (
    <div className="relative min-h-screen bg-black">
      <ScreenColumn>
        <Heading>Show me your ticket</Heading>
        <Body>I'll read the platform number from it.</Body>

        <div className="mt-3 flex flex-col gap-4">
          <BigButton
            title="Photograph ticket"
            subtitle="Use the camera"
            icon="📷"
            minHeight="112px"
            onClick={() => vm.go('ticketCamera')}
          />

          <BigButton
            title="Choose a picture"
            subtitle="A ticket saved on this device"
            icon="🖼"
            container={Palette.railBlue}
            content={Palette.paper}
            minHeight="112px"
            onClick={() => fileInputRef.current?.click()}
          />
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*"
            className="hidden"
          />

          <OutlineButton
            title="Type the number"
            icon="🔢"
            onClick={() => vm.go('keypad')}
          />

          {/* Quick testing presets */}
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <div className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-2">
              Quick Test Samples
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => useSampleTicket('2')}
                className="bg-zinc-800 hover:bg-zinc-700 text-yellow-400 font-bold py-3 px-2 rounded-xl text-base border border-zinc-700 cursor-pointer"
              >
                Sample: Platform 2
              </button>
              <button
                type="button"
                onClick={() => useSampleTicket('1A')}
                className="bg-zinc-800 hover:bg-zinc-700 text-yellow-400 font-bold py-3 px-2 rounded-xl text-base border border-zinc-700 cursor-pointer"
              >
                Sample: Platform 1A
              </button>
              <button
                type="button"
                onClick={() => useSampleTicket(null)}
                className="col-span-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold py-2.5 px-2 rounded-xl text-sm border border-zinc-800 cursor-pointer"
              >
                Sample: Ticket with no platform
              </button>
            </div>
          </div>
        </div>
      </ScreenColumn>

      {vm.busy && <CheckingOverlay text="Reading ticket…" />}
    </div>
  );
}

// ============================================================================
// 2. TICKET CAMERA SCREEN
// ============================================================================
export function TicketCameraScreen({ vm }) {
  const videoRef = useRef(null);

  const captureAndRead = async () => {
    if (!videoRef.current || vm.busy) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    vm.processTicketCanvas(canvas);
  };

  return (
    <div className="relative w-full h-screen bg-black flex flex-col">
      <div className="relative flex-1 w-full overflow-hidden">
        <CameraView videoRef={videoRef} />

        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4">
          <div className="pointer-events-auto">
            <OutlineButton
              title="Back"
              icon="←"
              onClick={vm.back}
              minHeight="60px"
              className="max-w-[140px]"
            />
          </div>

          <div
            className="p-4 rounded-xl text-center shadow-lg"
            style={{ backgroundColor: Palette.scrim }}
          >
            <Body className="font-bold">Lay the ticket flat. Fill the screen with it.</Body>
          </div>
        </div>
      </div>

      <div className="p-4 bg-black">
        <BigButton
          title="Take photo"
          subtitle="Point at your ticket"
          icon="📸"
          minHeight="112px"
          onClick={captureAndRead}
          enabled={!vm.busy}
        />
      </div>

      {vm.busy && <CheckingOverlay text="Reading ticket…" />}
    </div>
  );
}

// ============================================================================
// 3. CONFIRM SCREEN
// ============================================================================
export function ConfirmScreen({ vm, reading }) {
  const p = reading?.platform;
  const confident = reading?.confident;

  return (
    <ScreenColumn>
      {!p ? (
        <>
          <Heading>No platform number found</Heading>
          <Body>
            Many tickets don't print the platform. Check the station display or ask staff, then type
            it here.
          </Body>
          <div className="mt-4 flex flex-col gap-4">
            <BigButton
              title="Type the number"
              icon="🔢"
              onClick={() => vm.go('keypad')}
              minHeight="112px"
            />
            <OutlineButton
              title="Try another photo"
              icon="📷"
              onClick={() => vm.go('ticket')}
            />
          </div>
        </>
      ) : confident ? (
        <>
          <PlatformBoard platform={p} caption="Your target" />
          <div className="mt-4 flex flex-col gap-4">
            <BigButton
              title="Start journey"
              icon="▶"
              minHeight="120px"
              onClick={() => vm.confirmTarget(p)}
            />
            <OutlineButton
              title="Change"
              onClick={() => vm.go('keypad')}
            />
          </div>
        </>
      ) : (
        <>
          <Heading>I found Platform {p}. Is that correct?</Heading>
          <PlatformBoard platform={p} caption="Is this right?" numberSize="text-6xl" />
          <div className="mt-4 flex flex-col gap-4">
            <BigButton
              title="Yes"
              icon="✓"
              container={Palette.signalGreen}
              content={Palette.paper}
              minHeight="112px"
              onClick={() => vm.confirmTarget(p)}
            />
            <OutlineButton
              title="Change"
              onClick={() => vm.go('keypad')}
            />
          </div>
        </>
      )}
    </ScreenColumn>
  );
}

// ============================================================================
// 4. KEYPAD SCREEN
// ============================================================================
export function KeypadScreen({ vm }) {
  const [entry, setEntry] = useState('');
  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['A', '0', '⌫'],
  ];

  const handleKey = (key) => {
    if (key === '⌫') {
      setEntry((prev) => prev.slice(0, -1));
    } else if (entry.length < 3) {
      setEntry((prev) => prev + key);
    }
  };

  const isValid = PlatformParser.isValidId(entry);

  return (
    <ScreenColumn>
      <Heading>Type your platform number</Heading>
      <PlatformBoard
        platform={entry || '–'}
        caption="Your target"
        numberSize="text-6xl"
        spokenLabel={entry ? `Platform ${entry}` : 'No number typed yet'}
      />

      <div className="flex flex-col gap-3 my-2">
        {rows.map((row, rIdx) => (
          <div key={rIdx} className="grid grid-cols-3 gap-3">
            {row.map((key) => {
              const isDelete = key === '⌫';
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleKey(key)}
                  className="rounded-2xl h-20 text-3xl font-black flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow"
                  style={{
                    backgroundColor: isDelete ? Palette.disabled : Palette.paper,
                    color: Palette.ink,
                  }}
                  aria-label={
                    isDelete
                      ? 'Delete'
                      : key === 'A'
                      ? 'Letter A, for platforms like 1A'
                      : `Number ${key}`
                  }
                >
                  {key}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <BigButton
        title="Use this platform"
        icon="✓"
        enabled={isValid}
        minHeight="112px"
        onClick={() => vm.confirmTarget(entry)}
      />
      <OutlineButton title="Back" onClick={vm.back} minHeight="64px" />
    </ScreenColumn>
  );
}

// ============================================================================
// 5. HOME SCREEN
// ============================================================================
export function HomeScreen({ vm, target }) {
  return (
    <ScreenColumn>
      <PlatformBoard platform={target} caption="Your target" numberSize="text-8xl" />

      <div className="mt-2 flex flex-col gap-4">
        <BigButton
          title="Live guide"
          subtitle="Find it with your camera"
          icon="📷"
          minHeight="128px"
          onClick={() => vm.go('live')}
        />

        <BigButton
          title="Snap a board"
          subtitle="Check one sign"
          icon="📸"
          container={Palette.railBlue}
          content={Palette.paper}
          minHeight="128px"
          onClick={() => vm.go('snap')}
        />

        <div className="grid grid-cols-2 gap-3 mt-1">
          <OutlineButton
            title="New ticket"
            minHeight="72px"
            onClick={() => vm.go('ticket')}
          />
          <OutlineButton
            title={vm.vibration ? 'Vibrate: on' : 'Vibrate: off'}
            minHeight="72px"
            onClick={vm.toggleVibration}
          />
        </div>
      </div>
    </ScreenColumn>
  );
}

// ============================================================================
// 6. LIVE GUIDE SCREEN
// ============================================================================
export function LiveGuideScreen({ vm, target }) {
  const [display, setDisplay] = useState({
    state: TrackerState.SEARCHING,
    position: Position.UNKNOWN,
    arrow: null,
  });

  const videoRef = useRef(null);
  const trackerRef = useRef(null);
  const isAnalyzingRef = useRef(false);
  const animFrameRef = useRef(null);

  useEffect(() => {
    trackerRef.current = new LiveGuideTracker(target);
    voiceGuide.say(Phrases.liveStart(target), true);

    const interval = setInterval(async () => {
      if (isAnalyzingRef.current || !videoRef.current || !trackerRef.current) return;
      const video = videoRef.current;
      if (video.readyState < 2) return;

      isAnalyzingRef.current = true;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(video.videoWidth || 640, 640);
        canvas.height = Math.min(video.videoHeight || 360, 360);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const page = await recognizeImage(canvas, canvas.width, canvas.height);
        const analysis = vm.engine.analyze(page, target);
        const now = Date.now();
        const update = trackerRef.current.onFrame(analysis.target, now);

        if (update.speech) {
          voiceGuide.say(update.speech);
        }
        if (update.cue) {
          haptics.play(update.cue);
        }
        setDisplay(update.display);
      } catch (err) {
        // frame drop
      } finally {
        isAnalyzingRef.current = false;
      }
    }, 500);

    return () => {
      clearInterval(interval);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      voiceGuide.stop();
    };
  }, [target, vm.engine]);

  // Simulation controls for testing guidance without needing to be at an Indian railway station!
  const simulateFrame = (pos, arrow = null) => {
    if (!trackerRef.current) return;
    const fakeHit = {
      isRelevant: true,
      matchedText: `PLATFORM ${target}`,
      platforms: [target],
      confidence: 0.95,
      position: pos,
      direction:
        arrow === Arrow.LEFT
          ? Direction.LEFT
          : arrow === Arrow.RIGHT
          ? Direction.RIGHT
          : Direction.STRAIGHT,
      arrow: arrow,
      box: new Box(100, 100, 300, 200),
    };
    const now = Date.now();
    const update = trackerRef.current.onFrame(fakeHit, now);
    if (update.speech) voiceGuide.say(update.speech);
    if (update.cue) haptics.play(update.cue);
    setDisplay(update.display);
  };

  const simulateLost = () => {
    if (!trackerRef.current) return;
    const now = Date.now() + 4000;
    const update = trackerRef.current.onFrame(null, now);
    if (update.speech) voiceGuide.say(update.speech);
    if (update.cue) haptics.play(update.cue);
    setDisplay(update.display);
  };

  return (
    <div className="relative w-full h-screen bg-black flex flex-col">
      <div className="relative flex-1 w-full overflow-hidden">
        <CameraView videoRef={videoRef} />

        {/* Top Control Bar */}
        <div className="absolute top-0 inset-x-0 p-4 flex justify-between items-center z-20">
          <OutlineButton
            title="Stop"
            icon="■"
            onClick={vm.back}
            minHeight="60px"
            className="max-w-[140px]"
          />
        </div>

        {/* Bottom Guidance Panel */}
        <div className="absolute bottom-0 inset-x-0 p-4 flex flex-col gap-3 z-20">
          <GuidancePanel
            display={display}
            target={target}
            onRepeat={() => voiceGuide.repeatLast()}
          />

          {/* On-screen quick test / simulate buttons for reviewers */}
          <div className="flex flex-wrap gap-1.5 justify-center bg-black/80 backdrop-blur p-2 rounded-xl border border-zinc-800 text-xs">
            <span className="text-zinc-400 self-center font-bold px-1">Simulate Sign:</span>
            <button
              onClick={() => simulateFrame(Position.LEFT, Arrow.LEFT)}
              className="bg-zinc-800 hover:bg-zinc-700 text-yellow-400 px-2.5 py-1.5 rounded font-bold"
            >
              ← Left
            </button>
            <button
              onClick={() => simulateFrame(Position.CENTER, null)}
              className="bg-zinc-800 hover:bg-zinc-700 text-yellow-400 px-2.5 py-1.5 rounded font-bold"
            >
              ↑ Ahead
            </button>
            <button
              onClick={() => simulateFrame(Position.RIGHT, Arrow.RIGHT)}
              className="bg-zinc-800 hover:bg-zinc-700 text-yellow-400 px-2.5 py-1.5 rounded font-bold"
            >
              → Right
            </button>
            <button
              onClick={simulateLost}
              className="bg-zinc-800 hover:bg-zinc-700 text-red-400 px-2.5 py-1.5 rounded font-bold"
            >
              ? Lost
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GuidancePanel({ display, target, onRepeat }) {
  const isTracking = display.state === TrackerState.TRACKING;
  let glyph = '◎';
  let headline = `Looking for Platform ${target}`;
  let detail = 'Move your phone slowly.';

  if (display.state === TrackerState.LOST) {
    glyph = '?';
    headline = `Lost Platform ${target}`;
    detail = 'Move the camera slowly.';
  } else if (isTracking) {
    switch (display.position) {
      case Position.LEFT:
        glyph = '←';
        headline = 'To your left';
        detail = `Platform ${target}`;
        break;
      case Position.RIGHT:
        glyph = '→';
        headline = 'To your right';
        detail = `Platform ${target}`;
        break;
      case Position.CENTER:
        glyph = '↑';
        headline = 'Straight ahead';
        detail =
          display.arrow === Arrow.LEFT
            ? `Platform ${target}. The sign points left.`
            : display.arrow === Arrow.RIGHT
            ? `Platform ${target}. The sign points right.`
            : `Platform ${target}`;
        break;
      default:
        glyph = '✓';
        headline = `Platform ${target} seen`;
        detail = 'Follow the signs.';
        break;
    }
  }

  const bg = isTracking ? Palette.boardYellow : Palette.scrim;
  const fg = isTracking ? Palette.ink : Palette.paper;
  const border =
    display.state === TrackerState.LOST
      ? `3px solid ${Palette.signalRed}`
      : '3px solid transparent';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onRepeat}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onRepeat()}
      style={{
        backgroundColor: bg,
        color: fg,
        border: border,
        minHeight: '140px',
      }}
      className="w-full rounded-2xl p-4 flex items-center transition-all cursor-pointer shadow-2xl select-none"
      aria-label={`${headline}. ${detail}. Tap to hear again.`}
    >
      <div className="text-7xl font-black w-24 text-center flex-shrink-0 leading-none">
        {glyph}
      </div>
      <div className="flex-1 ml-4 flex flex-col justify-center">
        <div className="text-2xl sm:text-3xl font-black leading-tight tracking-tight">
          {headline}
        </div>
        <div className="text-lg sm:text-xl font-medium mt-1 leading-snug">{detail}</div>
        <div className="text-sm font-semibold opacity-75 mt-1">Tap to hear again</div>
      </div>
    </div>
  );
}

// ============================================================================
// 7. SNAP SCREEN
// ============================================================================
export function SnapScreen({ vm, target }) {
  const [outcome, setOutcome] = useState(null);
  const [checking, setChecking] = useState(false);
  const videoRef = useRef(null);

  const captureAndCheck = async () => {
    if (!videoRef.current || checking) return;
    setChecking(true);
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const page = await recognizeImage(canvas, canvas.width, canvas.height);
      const res = await vm.checkBoard(page);
      setOutcome(res);
    } catch (err) {
      const fallback = SnapInterpreter.interpret({ lines: [] });
      setOutcome(fallback);
      voiceGuide.say(Phrases.snap(fallback, target), true);
    } finally {
      setChecking(false);
    }
  };

  const simulateBoardSnap = (fakePage) => {
    setChecking(true);
    setTimeout(() => {
      const res = vm.checkBoard(fakePage);
      setOutcome(res);
      setChecking(false);
    }, 300);
  };

  if (outcome) {
    return (
      <SnapResult
        outcome={outcome}
        target={target}
        onAgain={() => setOutcome(null)}
        onDone={vm.back}
      />
    );
  }

  return (
    <div className="relative w-full h-screen bg-black flex flex-col">
      <div className="relative flex-1 w-full overflow-hidden">
        <CameraView videoRef={videoRef} />

        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4">
          <div className="pointer-events-auto">
            <OutlineButton
              title="Back"
              icon="←"
              onClick={vm.back}
              minHeight="60px"
              className="max-w-[140px]"
            />
          </div>

          <div
            className="p-4 rounded-xl text-center shadow-lg"
            style={{ backgroundColor: Palette.scrim }}
          >
            <Body className="font-bold">Point at a sign for Platform {target}.</Body>
          </div>
        </div>
      </div>

      <div className="p-4 bg-black flex flex-col gap-2">
        <BigButton
          title="Take photo"
          subtitle="Check this board"
          icon="📸"
          minHeight="112px"
          onClick={captureAndCheck}
          enabled={!checking}
        />

        {/* Review testing board simulations */}
        <div className="flex flex-wrap gap-2 justify-center pt-2 border-t border-zinc-800 text-xs">
          <span className="text-zinc-400 self-center font-bold">Simulate Board:</span>
          <button
            onClick={() =>
              simulateBoardSnap(
                new OcrPage([new OcrLine(`PLATFORM ${target} →`, new Box(400, 100, 800, 200), 0.95)], 1000, 500)
              )
            }
            className="bg-zinc-800 hover:bg-zinc-700 text-green-400 px-2 py-1 rounded font-bold"
          >
            Matches (PF {target} →)
          </button>
          <button
            onClick={() =>
              simulateBoardSnap(
                new OcrPage([new OcrLine('PLATFORM 4', new Box(400, 100, 800, 200), 0.95)], 1000, 500)
              )
            }
            className="bg-zinc-800 hover:bg-zinc-700 text-red-400 px-2 py-1 rounded font-bold"
          >
            Wrong Board (PF 4)
          </button>
          <button
            onClick={() =>
              simulateBoardSnap(
                new OcrPage([new OcrLine('WAITING ROOM', new Box(400, 100, 800, 200), 0.95)], 1000, 500)
              )
            }
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-1 rounded font-bold"
          >
            Not Visible
          </button>
        </div>
      </div>

      {checking && <CheckingOverlay text="Checking board…" />}
    </div>
  );
}

function SnapResult({ outcome, target, onAgain, onDone }) {
  let bg = Palette.ink;
  let fg = Palette.paper;

  if (outcome.type === SnapOutcomeType.FOUND) {
    bg = Palette.signalGreen;
    fg = Palette.ink;
  } else if (outcome.type === SnapOutcomeType.WRONG_BOARD) {
    bg = Palette.signalRed;
    fg = Palette.paper;
  }

  return (
    <div className="min-h-screen p-5 flex flex-col justify-start" style={{ backgroundColor: bg }}>
      <ScreenColumn className="max-w-lg">
        {outcome.type === SnapOutcomeType.FOUND && (
          <>
            <Heading className="text-black">✓ Platform {target}</Heading>
            <div className="text-8xl sm:text-9xl font-black text-black my-2">
              {outcome.result.direction === Direction.STRAIGHT
                ? '↑'
                : outcome.result.direction === Direction.LEFT
                ? '←'
                : outcome.result.direction === Direction.RIGHT
                ? '→'
                : '✓'}
            </div>
            <div className="text-3xl sm:text-4xl font-black text-black leading-tight">
              {outcome.result.direction === Direction.STRAIGHT
                ? 'Straight ahead'
                : outcome.result.direction === Direction.LEFT
                ? 'To your left'
                : outcome.result.direction === Direction.RIGHT
                ? 'To your right'
                : `Follow signs for Platform ${target}`}
            </div>
            <div className="mt-6 flex flex-col gap-4">
              <BigButton
                title="Continue"
                onClick={onDone}
                container={Palette.ink}
                content={Palette.paper}
                minHeight="104px"
              />
              <OutlineButton title="Check another sign" onClick={onAgain} minHeight="80px" />
            </div>
          </>
        )}

        {outcome.type === SnapOutcomeType.WRONG_BOARD && (
          <>
            <Heading>Not your platform</Heading>
            <div className="text-2xl sm:text-3xl font-bold leading-tight mt-1">
              {outcome.platforms.length === 1
                ? `This is Platform ${outcome.platforms[0]}`
                : `This is for Platforms ${outcome.platforms.join(', ')}`}
            </div>
            <div className="my-4">
              <PlatformBoard platform={target} caption="You need" numberSize="text-6xl" />
            </div>
            <BigButton
              title="Scan again"
              icon="📸"
              onClick={onAgain}
              minHeight="112px"
            />
          </>
        )}

        {outcome.type === SnapOutcomeType.UNCLEAR && (
          <>
            <Heading>I couldn't read this board</Heading>
            <Body>Hold the device closer to the sign and keep it steady.</Body>
            <div className="mt-6">
              <BigButton
                title="Scan again"
                icon="📸"
                onClick={onAgain}
                minHeight="112px"
              />
            </div>
          </>
        )}

        {outcome.type === SnapOutcomeType.NOT_VISIBLE && (
          <>
            <Heading>Platform {target} not found</Heading>
            <Body>This sign isn't about your platform. Try another board.</Body>
            <div className="mt-6">
              <BigButton
                title="Scan again"
                icon="📸"
                onClick={onAgain}
                minHeight="112px"
              />
            </div>
          </>
        )}
      </ScreenColumn>
    </div>
  );
}
