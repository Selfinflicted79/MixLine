import { useEffect, useRef, useState } from "react";
import { cn } from "cn";

type RackTitleProps = {
  prefix: string;
  name: string;
  onRename: (name: string) => void;
  lit?: boolean;
  bankIndex?: number;
  bankCount?: number;
  canAddBank?: boolean;
  onAddBank?: () => void;
  onPrevBank?: () => void;
  onNextBank?: () => void;
};

/** Screen-style rack name — Back/Next sit together after the name. */
export function RackTitle({
  prefix,
  name,
  onRename,
  lit = true,
  bankIndex = 0,
  bankCount = 1,
  canAddBank = false,
  onAddBank,
  onPrevBank,
  onNextBank,
}: RackTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  const multi = bankCount > 1;

  useEffect(() => {
    setDraft(name);
  }, [name]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  function commit() {
    const next = draft.trim() || name || "Main";
    setDraft(next);
    onRename(next);
    setEditing(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={cn("rack-name-screen text-left", lit && "rack-name-screen--on")}
        onClick={() => {
          if (!editing) setEditing(true);
        }}
        title="Click to rename this rack"
      >
        <span className="rack-name-screen__prefix">{prefix}</span>
        {editing ? (
          <input
            ref={inputRef}
            className="rack-name-screen__input"
            value={draft}
            maxLength={24}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") {
                setDraft(name);
                setEditing(false);
              }
            }}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <span className="rack-name-screen__name">{name}</span>
        )}
        <span className="rack-name-screen__led" aria-hidden />
        {onAddBank ? (
          <span
            role="button"
            tabIndex={0}
            className={cn(
              "rack-name-screen__add",
              !canAddBank && "rack-name-screen__add--disabled",
            )}
            title={canAddBank ? "Add bank (max 3)" : "Bank limit reached (3)"}
            onClick={(event) => {
              event.stopPropagation();
              if (canAddBank) onAddBank();
            }}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && canAddBank) {
                event.preventDefault();
                event.stopPropagation();
                onAddBank();
              }
            }}
          >
            +
          </span>
        ) : null}
        {multi ? (
          <span className="rack-name-screen__bank">
            {bankIndex + 1}/{bankCount}
          </span>
        ) : null}
      </button>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={cn("rack-bank-btn", !multi && "opacity-35")}
          disabled={!multi}
          onClick={onPrevBank}
          title="Previous bank"
        >
          ◀ Back
        </button>
        <button
          type="button"
          className={cn("rack-bank-btn", !multi && "opacity-35")}
          disabled={!multi}
          onClick={onNextBank}
          title="Next bank"
        >
          Next ▶
        </button>
      </div>
    </div>
  );
}
