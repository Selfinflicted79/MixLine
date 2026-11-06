import { useMemo, useState, type ReactNode } from "react";
import { AppWindow, Cable, Mic, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AudioDevice } from "@/lib/audio-engine";
import type { DesktopSource } from "@/vite-env";
import { cn } from "cn";

function isMicDevice(label: string) {
  return /microphone|headset|mic\b|webcam|camera/i.test(label);
}

function isVirtualCable(label: string) {
  return /cable|voicemeeter|vb-audio|virtual|vaux|vaio/i.test(label);
}

function isDiscordCable(label: string) {
  // Common VB-Cable recording side used as Discord mic — warn, don't forbid.
  return /cable output/i.test(label) && !/input/i.test(label);
}

function cleanAppName(name: string) {
  return name
    .replace(/\s*-\s*YouTube Music$/i, "YouTube Music")
    .replace(/\s*[—|-]\s*Google Chrome$/i, "")
    .replace(/\s*[—|-]\s*Microsoft Edge$/i, "")
    .trim() || name;
}

type AddAppDialogProps = {
  windows: DesktopSource[];
  inputDevices: AudioDevice[];
  onClose: () => void;
  onConfirm: (appName: string, deviceId: string) => void;
  onOpenWindowsSoundSettings?: () => void;
};

export function AddAppDialog({
  windows,
  inputDevices,
  onClose,
  onConfirm,
  onOpenWindowsSoundSettings,
}: AddAppDialogProps) {
  const [step, setStep] = useState<"app" | "device">("app");
  const [selectedApp, setSelectedApp] = useState<string>("");
  const [showMics, setShowMics] = useState(false);

  const appWindows = useMemo(() => {
    const filtered = windows.filter((w) => {
      const n = w.name.trim();
      if (!n) return false;
      if (/^(Program Manager|Microsoft Text Input Application)$/i.test(n)) return false;
      return true;
    });
    // Prefer music / browser apps near the top.
    return filtered.sort((a, b) => {
      const score = (name: string) =>
        /youtube|spotify|discord|chrome|edge|firefox|music/i.test(name) ? 0 : 1;
      return score(a.name) - score(b.name) || a.name.localeCompare(b.name);
    });
  }, [windows]);

  const { cables, other, mics } = useMemo(() => {
    const cables: AudioDevice[] = [];
    const other: AudioDevice[] = [];
    const mics: AudioDevice[] = [];
    for (const d of inputDevices) {
      if (isMicDevice(d.label)) mics.push(d);
      else if (isVirtualCable(d.label)) cables.push(d);
      else other.push(d);
    }
    return { cables, other, mics };
  }, [inputDevices]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--console-ink)]/45 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add application"
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[color:var(--console-edge)] bg-[color:var(--console-face)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[color:var(--console-edge)] px-4 py-3">
          <div>
            <h3 className="font-[family-name:var(--font-display)] text-xl text-[color:var(--console-ink)]">
              {step === "app" ? "1. Which app?" : `2. Audio for ${selectedApp}`}
            </h3>
            <p className="text-sm text-[color:var(--console-muted)]">
              {step === "app"
                ? "Pick the open window (YouTube Music, Spotify, etc.)."
                : "Windows won’t list apps as mics. Point that app at a virtual cable, then pick the cable here."}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-[color:var(--console-muted)] hover:bg-[color:var(--chip)]"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {step === "app" ? (
            appWindows.length === 0 ? (
              <p className="px-3 py-6 text-sm text-[color:var(--console-muted)]">
                No open windows found. Open YouTube Music (or your app), then try again.
              </p>
            ) : (
              appWindows.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm text-[color:var(--console-ink)] hover:bg-[color:var(--chip)]"
                  onClick={() => {
                    setSelectedApp(cleanAppName(source.name));
                    setStep("device");
                  }}
                >
                  <AppWindow className="size-4 shrink-0 opacity-70" />
                  <span className="truncate">{source.name}</span>
                </button>
              ))
            )
          ) : (
            <div className="space-y-3 px-1 pb-2">
              <div className="rounded-md border border-[color:var(--accent-lime)]/50 bg-[color:var(--accent-lime)]/15 px-3 py-2 text-xs leading-relaxed text-[color:var(--console-ink)]">
                In Windows: <strong>Settings → System → Sound → Volume mixer</strong> →{" "}
                <strong>{selectedApp}</strong> → Output → a <strong>second</strong> virtual
                cable (not the one Discord uses). Then select that cable below.
                {onOpenWindowsSoundSettings ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={onOpenWindowsSoundSettings}
                    >
                      Open sound settings
                    </button>
                  </>
                ) : null}
              </div>

              {cables.length === 0 && other.length === 0 ? (
                <p className="px-2 py-4 text-sm text-[color:var(--console-muted)]">
                  No virtual cables found yet — only microphones are installed. Add another
                  VB-Cable / VoiceMeeter VAIO, set {selectedApp} to play into it, then refresh.
                </p>
              ) : null}

              {cables.length > 0 ? (
                <DeviceGroup title="Virtual cables (use these)" icon={Cable}>
                  {cables.map((d) => (
                    <DeviceRow
                      key={d.deviceId}
                      label={d.label}
                      hint={
                        isDiscordCable(d.label)
                          ? "Often Discord’s mic — only use if this cable is dedicated to the app"
                          : undefined
                      }
                      onClick={() => onConfirm(selectedApp, d.deviceId)}
                    />
                  ))}
                </DeviceGroup>
              ) : null}

              {other.length > 0 ? (
                <DeviceGroup title="Other inputs" icon={AppWindow}>
                  {other.map((d) => (
                    <DeviceRow
                      key={d.deviceId}
                      label={d.label}
                      onClick={() => onConfirm(selectedApp, d.deviceId)}
                    />
                  ))}
                </DeviceGroup>
              ) : null}

              <div>
                <button
                  type="button"
                  className="px-2 text-xs font-semibold tracking-wide text-[color:var(--console-muted)] uppercase hover:text-[color:var(--console-ink)]"
                  onClick={() => setShowMics((v) => !v)}
                >
                  {showMics ? "Hide microphones" : "Show microphones (usually wrong)"}
                </button>
                {showMics ? (
                  <DeviceGroup title="Microphones" icon={Mic}>
                    {mics.map((d) => (
                      <DeviceRow
                        key={d.deviceId}
                        label={d.label}
                        hint="This is a mic, not YouTube — only pick if you really mean to"
                        muted
                        onClick={() => onConfirm(selectedApp, d.deviceId)}
                      />
                    ))}
                  </DeviceGroup>
                ) : null}
              </div>

              <div className="flex gap-2 px-1 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="border-[color:var(--console-edge)] bg-[color:var(--chip)] text-[color:var(--console-ink)]"
                  onClick={() => setStep("app")}
                >
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DeviceGroup({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Cable;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 px-2 text-[10px] font-semibold tracking-wide text-[color:var(--console-muted)] uppercase">
        <Icon className="size-3.5" />
        {title}
      </div>
      {children}
    </div>
  );
}

function DeviceRow({
  label,
  hint,
  muted,
  onClick,
}: {
  label: string;
  hint?: string;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full flex-col items-start rounded-md px-3 py-2.5 text-left text-sm hover:bg-[color:var(--chip)]",
        muted ? "text-[color:var(--console-muted)]" : "text-[color:var(--console-ink)]",
      )}
      onClick={onClick}
    >
      <span className="truncate">{label}</span>
      {hint ? <span className="text-[10px] text-[color:var(--console-muted)]">{hint}</span> : null}
    </button>
  );
}
