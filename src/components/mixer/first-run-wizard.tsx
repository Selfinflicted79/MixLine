import { useEffect, useState } from "react";
import { Sparkles, X, Zap } from "lucide-react";
import { markWizardFinished } from "@/lib/wizard";
import { cn } from "@/lib/utils";

type Phase = "ask" | "tour" | "done";

const STEPS = [
  {
    tag: "01 · Power",
    title: "Boot the rack",
    body: "Hit Power on board. Stream rack feeds Discord/OBS. Add a PC rack for your headset listen mix — same board, different job.",
    accent: "cyan" as const,
    flash: ["STREAM", "PC", "LIVE"],
  },
  {
    tag: "02 · Cues",
    title: "Pads that slap",
    body: "Drop sounds on the cue rack. MIX sends to stream, MON is your ears. Double-click a cue fader to kill that sound’s plays.",
    accent: "orange" as const,
    flash: ["MIX", "MON", "KILL"],
  },
  {
    tag: "03 · Play",
    title: "Music strip",
    body: "Play is one shared level on every rack. MIX → stream, MON → ears. Load a playlist — it sticks between sessions.",
    accent: "magenta" as const,
    flash: ["PLAY", "MIX", "MON"],
  },
  {
    tag: "04 · Mix",
    title: "Know your green fader",
    body: "On Stream, Mix is the Discord/OBS send. On PC, Mix is Windows volume for your headset — wheels, tray, and this fader stay locked.",
    accent: "green" as const,
    flash: ["STREAM", "WINDOWS", "SYNC"],
  },
  {
    tag: "05 · Controller",
    title: "Pads & sliders",
    body: "Open Controller — Share from Stream Controller is best. Slider 3 defaults to Play, 4 is Mix for the rack you’re on. One target per slider.",
    accent: "cyan" as const,
    flash: ["SHARE", "PLAY", "MIX"],
  },
];

type FirstRunWizardProps = {
  open: boolean;
  forceTour?: boolean;
  onClose: () => void;
};

export function FirstRunWizard({ open, forceTour = false, onClose }: FirstRunWizardProps) {
  const [phase, setPhase] = useState<Phase>(forceTour ? "tour" : "ask");
  const [step, setStep] = useState(0);
  const [flashOn, setFlashOn] = useState(true);

  useEffect(() => {
    if (!open) return;
    setPhase(forceTour ? "tour" : "ask");
    setStep(0);
  }, [open, forceTour]);

  useEffect(() => {
    if (!open || phase !== "tour") return;
    const timer = window.setInterval(() => setFlashOn((v) => !v), 520);
    return () => window.clearInterval(timer);
  }, [open, phase, step]);

  if (!open) return null;

  function finish() {
    markWizardFinished();
    setPhase("done");
    onClose();
  }

  function skipAsk() {
    markWizardFinished();
    onClose();
  }

  const current = STEPS[step]!;
  const accentClass =
    current.accent === "orange"
      ? "wizard-accent-orange"
      : current.accent === "magenta"
        ? "wizard-accent-magenta"
        : current.accent === "green"
          ? "wizard-accent-green"
          : "wizard-accent-cyan";

  return (
    <div className="wizard-root" role="dialog" aria-modal="true" aria-label="MixLine wizard">
      <div className="wizard-veil" onClick={phase === "ask" ? skipAsk : undefined} />
      <div className={cn("wizard-panel", accentClass)}>
        <div className="wizard-scan" aria-hidden />
        <button
          type="button"
          className="wizard-close"
          onClick={phase === "ask" ? skipAsk : finish}
          aria-label="Close wizard"
        >
          <X className="size-4" />
        </button>

        {phase === "ask" ? (
          <div className="wizard-ask">
            <p className="wizard-eyebrow">
              <Zap className="size-3.5" />
              First boot
            </p>
            <h2 className="wizard-title">Want the Wizard?</h2>
            <p className="wizard-copy">
              Thirty seconds. Neon tour of racks, cues, Play, Mix, and your controller — then you’re
              live.
            </p>
            <div className="wizard-flash-row" aria-hidden>
              {["CUE", "PLAY", "MIX"].map((label) => (
                <span key={label} className="wizard-chip">
                  {label}
                </span>
              ))}
            </div>
            <div className="wizard-actions">
              <button type="button" className="wizard-btn wizard-btn-primary" onClick={() => setPhase("tour")}>
                <Sparkles className="size-4" />
                Run the Wizard
              </button>
              <button type="button" className="wizard-btn wizard-btn-ghost" onClick={skipAsk}>
                Nah, I’m good
              </button>
            </div>
          </div>
        ) : (
          <div className="wizard-tour" key={step}>
            <p className="wizard-eyebrow">{current.tag}</p>
            <h2 className="wizard-title">{current.title}</h2>
            <p className="wizard-copy">{current.body}</p>
            <div className="wizard-flash-row" aria-hidden>
              {current.flash.map((label, index) => (
                <span
                  key={label}
                  className={cn("wizard-chip", flashOn && index === step % 3 && "wizard-chip-lit")}
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="wizard-progress">
              {STEPS.map((item, index) => (
                <span
                  key={item.tag}
                  className={cn("wizard-dot", index === step && "wizard-dot-on", index < step && "wizard-dot-done")}
                />
              ))}
            </div>
            <div className="wizard-actions">
              {step > 0 ? (
                <button type="button" className="wizard-btn wizard-btn-ghost" onClick={() => setStep((s) => s - 1)}>
                  Back
                </button>
              ) : (
                <button type="button" className="wizard-btn wizard-btn-ghost" onClick={finish}>
                  Skip tour
                </button>
              )}
              {step < STEPS.length - 1 ? (
                <button
                  type="button"
                  className="wizard-btn wizard-btn-primary"
                  onClick={() => setStep((s) => s + 1)}
                >
                  Next
                </button>
              ) : (
                <button type="button" className="wizard-btn wizard-btn-primary" onClick={finish}>
                  <Zap className="size-4" />
                  Board’s hot — go
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
