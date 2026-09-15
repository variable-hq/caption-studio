"use client";

import { useEffect, useRef, useState } from "react";

const DISMISSED_KEY = "church-live-caption:operator-tutorial:v1";

const STEPS = [
  {
    label: "Overview",
    title: "Your first live translation",
    description: "A quick guide to getting speech from the microphone onto your audience’s screens.",
    exampleLabel: "Your setup",
    example: "Microphone · Caption computer · OBS & phones",
    location: "Before you begin",
    instructions: [
      "Receive audio on the caption computer. The operator checks the translation and controls the service here.",
      "Display captions in OBS on the separate computer. Both computers need internet access.",
      "Share the mobile viewer link after starting a service. Keep the reusable OBS URL private.",
    ],
    section: "audio",
    action: "Set up audio",
  },
  {
    label: "Audio",
    title: "Connect and test your audio",
    description: "Check that the input meter follows your microphone.",
    exampleLabel: "Microphone AUX feed",
    example: "AUX → USB audio interface → Caption computer",
    location: "Audio input",
    instructions: [
      "Connect the AUX feed to the interface, then connect its USB cable to the caption computer.",
      "Choose Enable audio test, allow access, and select your USB audio interface. Enable the test again if the meter stops.",
      "Speak and check the meter. Briefly mute AUX: the meter should stop following your speech.",
    ],
    section: "audio",
    action: "Open Audio input",
  },
  {
    label: "Languages",
    title: "Choose what the audience reads",
    description: "Set the spoken language, caption language, and useful church terminology.",
    exampleLabel: "Example language pair",
    example: "Spoken: Indonesian · Audience: English",
    location: "Translation",
    instructions: [
      "For this rehearsal, select Indonesian as spoken and English as audience language. Check the selections yourself.",
      "Choose a 6- to 18-second buffer. Longer buffers add delay. Add approved terminology and public filter terms if needed.",
      "During a service, choose Review refresh and Confirm refresh to apply draft changes. Check names, numbers, references, and meaning.",
    ],
    section: "translation",
    action: "Open Translation",
  },
  {
    label: "OBS",
    title: "Connect the OBS computer",
    description: "Set up the caption overlay once, then reuse it for future services.",
    exampleLabel: "OBS Browser Source",
    example: "1920 × 1080 · Reusable caption URL",
    location: "Appearance, then Live outputs",
    instructions: [
      "Use Appearance to choose readable text and safe margins. Verify the result on the actual OBS computer.",
      "In Live outputs, create the channel if needed. Paste its OBS URL into an OBS Browser Source at 1920 × 1080.",
      "Before capture, choose Show test, check OBS, then Clear live caption. Keep the OBS URL private; viewers use the mobile link.",
    ],
    section: "appearance",
    action: "Open Appearance",
  },
  {
    label: "Audience",
    title: "Start captions and invite viewers",
    description: "Begin only after audio, languages, and the OBS test are ready.",
    exampleLabel: "Two audience outputs",
    example: "OBS overlay · Mobile translation viewer",
    location: "Service controls, then Live outputs",
    instructions: [
      "Open Service controls, choose whether to save transcript history, then select Start captions. Resolve any setup message before continuing.",
      "Speak an approved test phrase. Allow for the buffer and processing time, then check the caption in OBS.",
      "Open Live outputs to share the mobile viewer or reader link, and to pair your operator phone. Each viewer can adjust their own text size.",
    ],
    section: "outputs",
    action: "Open audience outputs",
  },
  {
    label: "Controls",
    title: "Stay in control during the service",
    description: "Keep the dashboard within reach and check what the audience actually sees.",
    exampleLabel: "Remember",
    example: "Pause stops capture · Clear keeps capture running",
    location: "Live controls and AI usage",
    instructions: [
      "Pause stops capture and clears the current caption. Resume listens again. Clear live caption keeps committed reader paragraphs while capture continues.",
      "Watch AI usage and skipped captions. Pause to review repeated problems. The 90-minute timer continues while paused.",
      "Open Service controls → End service and confirm. Capture stops, captions clear, and the mobile link expires. Keep the OBS URL.",
    ],
    section: "usage",
    action: "Open AI usage",
  },
] as const;

export function OperatorTutorial({
  autoOpenAllowed,
  serviceActive,
  onOpenSection,
  dismissedForAccount = false,
  onDismiss,
}: {
  autoOpenAllowed: boolean;
  serviceActive: boolean;
  onOpenSection: (section: typeof STEPS[number]["section"]) => void;
  /** True when the signed-in operator's saved preferences already record a dismissal. */
  dismissedForAccount?: boolean;
  /** Called once per dismissal so the page can record it with the operator's account. */
  onDismiss?: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const autoOpenChecked = useRef(false);
  const [step, setStep] = useState(0);
  const current = STEPS[step];

  useEffect(() => {
    if (!autoOpenAllowed || autoOpenChecked.current) return;
    const frame = requestAnimationFrame(() => {
      if (autoOpenChecked.current) return;
      autoOpenChecked.current = true;
      if (dismissedForAccount) return;
      try {
        if (localStorage.getItem(DISMISSED_KEY) === "dismissed") return;
      } catch {
        // The guide remains usable when browser preference storage is unavailable.
      }
      dialogRef.current?.showModal();
      headingRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [autoOpenAllowed, dismissedForAccount]);

  useEffect(() => {
    if (dialogRef.current?.open) headingRef.current?.focus();
  }, [step]);

  function openTutorial() {
    autoOpenChecked.current = true;
    dialogRef.current?.showModal();
    headingRef.current?.focus();
  }

  function dismissTutorial() {
    autoOpenChecked.current = true;
    try {
      localStorage.setItem(DISMISSED_KEY, "dismissed");
    } catch {
      // Only a dismissal flag is lost; the guide may reappear on the next visit.
    }
    onDismiss?.();
    dialogRef.current?.close();
    launcherRef.current?.focus();
  }

  return (
    <>
      <button ref={launcherRef} className="secondaryButton tutorialLauncher" type="button" onClick={openTutorial}>
        How to use
      </button>
      <dialog
        ref={dialogRef}
        className="tutorialDialog"
        aria-labelledby="tutorial-heading"
        onCancel={(event) => { event.preventDefault(); dismissTutorial(); }}
      >
        <div className="tutorialHeader">
          <p className="eyebrow">Operator guide</p>
          <button className="textButton" type="button" onClick={dismissTutorial}>Skip tutorial</button>
        </div>
        <div className="tutorialLayout">
          <label className="tutorialStepPicker">
            <span className="visuallyHidden">Tutorial step</span>
            <select value={step} onChange={(event) => setStep(Number(event.target.value))}>
              {STEPS.map(({ label }, index) => <option key={label} value={index}>{index + 1} of {STEPS.length} · {label}</option>)}
            </select>
          </label>
          <nav className="tutorialNav" aria-label="Tutorial steps">
            <ol>
              {STEPS.map(({ label }, index) => (
                <li key={label}>
                  <button
                    type="button"
                    aria-current={step === index ? "step" : undefined}
                    aria-label={`Step ${index + 1}: ${label}`}
                    onClick={() => setStep(index)}
                  >
                    <span className="tutorialStepNumber" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                    {label}
                  </button>
                </li>
              ))}
            </ol>
            <p>Reopen this guide anytime with <strong>How to use</strong>.</p>
          </nav>
          <div className="tutorialContent">
            {serviceActive ? <p className="tutorialServiceNote">A service is active. This guide leaves it running. Close the guide to reach the live controls.</p> : null}
            <p className="eyebrow">Step {step + 1} of {STEPS.length} · {current.location}</p>
            <h2 id="tutorial-heading" ref={headingRef} tabIndex={-1}>{current.title}</h2>
            <p id="tutorial-description">{current.description}</p>
            <div className="tutorialExample">
              <p>{current.exampleLabel}</p>
              <strong>{current.example}</strong>
            </div>
            <ol className="tutorialInstructions">
              {current.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}
            </ol>
            <button className="secondaryButton tutorialAction" type="button" onClick={() => {
              dismissTutorial();
              onOpenSection(current.section);
            }}>
              {current.action} <span aria-hidden="true">→</span>
            </button>
            <p className="tutorialReturnNote">Return to this step with <strong>How to use</strong>. Opening a section leaves your settings unchanged.</p>
          </div>
        </div>
        <div className="tutorialFooter">
          <button className="secondaryButton" type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
          {step === STEPS.length - 1 ? (
            <button className="primaryButton" type="button" onClick={dismissTutorial}>Go to dashboard</button>
          ) : (
            <button className="primaryButton" type="button" onClick={() => setStep(step + 1)}>Next step</button>
          )}
        </div>
      </dialog>
    </>
  );
}
