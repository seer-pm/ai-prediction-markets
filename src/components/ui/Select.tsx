import * as Popover from "@radix-ui/react-popover";
import { cn } from "@/utils/cn";
import { startTransition, useMemo, useState } from "react";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "./icons";

export type Option = { id: string; text: string };

/**
 * One searchable picker, in single- and multi-select form. Replaces
 * DropdownSelect and DropdownCheckbox, which were hand-rolled near-duplicates
 * with no keyboard support and no outside-click portal handling.
 */

function useFiltered(options: Option[], search: string) {
  return useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.text.toLowerCase().includes(needle));
  }, [options, search]);
}

function Trigger({ label, muted }: { label: string; muted: boolean }) {
  return (
    <Popover.Trigger
      className={cn(
        "flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-rule-strong bg-surface px-3 text-body shadow-raised transition-colors hover:border-ink-4",
        muted ? "text-ink-4" : "text-ink",
      )}
    >
      <span className="truncate">{label}</span>
      <ChevronDownIcon className="shrink-0 text-ink-4" />
    </Popover.Trigger>
  );
}

function Surface({
  search,
  setSearch,
  searchPlaceholder,
  children,
  searchable,
}: {
  search: string;
  setSearch: (value: string) => void;
  searchPlaceholder: string;
  children: React.ReactNode;
  searchable: boolean;
}) {
  return (
    <Popover.Portal>
      <Popover.Content
        align="start"
        sideOffset={4}
        collisionPadding={12}
        className="z-50 w-[var(--radix-popover-trigger-width)] min-w-56 overflow-hidden rounded-md border border-rule bg-surface shadow-pop"
      >
        {searchable && (
          <div className="flex items-center gap-2 border-b border-rule px-3 py-2">
            <SearchIcon className="shrink-0 text-ink-4" />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-body text-ink outline-none placeholder:text-ink-4"
            />
          </div>
        )}
        <div className="max-h-64 overflow-y-auto py-1">{children}</div>
      </Popover.Content>
    </Popover.Portal>
  );
}

const EMPTY = <p className="px-3 py-2 text-body text-ink-4">No matches</p>;

/**
 * Below this many options the list is quicker to read than to type into, so
 * the search field is hidden — it only got in the way on a two-item asset
 * picker. Pass `searchable` explicitly to override.
 */
const SEARCH_THRESHOLD = 8;

const rowClass =
  "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-body transition-colors hover:bg-primary-bg";

interface SelectProps {
  placeholder: string;
  options: Option[];
  selectedId?: string;
  onChange: (id: string | undefined) => void;
  searchPlaceholder?: string;
  /** Defaults to showing the search only for long lists. */
  searchable?: boolean;
  className?: string;
}

export function Select({
  placeholder,
  options,
  selectedId,
  onChange,
  searchPlaceholder = "Search…",
  searchable = options.length > SEARCH_THRESHOLD,
  className,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = useFiltered(options, searchable ? search : "");
  const selected = options.find((option) => option.id === selectedId);

  return (
    <div className={cn("w-64", className)}>
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
      >
        <Trigger label={selected?.text ?? placeholder} muted={!selected} />
        <Surface
          search={search}
          setSearch={setSearch}
          searchPlaceholder={searchPlaceholder}
          searchable={searchable}
        >
          {filtered.length === 0 && EMPTY}
          {filtered.map((option) => {
            const isSelected = option.id === selectedId;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  setSearch("");
                  startTransition(() => onChange(option.id));
                }}
                className={cn(rowClass, isSelected ? "text-ink" : "text-ink-2")}
              >
                <span className="w-4 shrink-0 text-primary">{isSelected && <CheckIcon />}</span>
                <span className="truncate">{option.text}</span>
              </button>
            );
          })}
        </Surface>
      </Popover.Root>
    </div>
  );
}

interface MultiSelectProps {
  placeholder: string;
  options: Option[];
  checkedIds: string[];
  onChange: (ids: string[]) => void;
  searchPlaceholder?: string;
  /** Defaults to showing the search only for long lists. */
  searchable?: boolean;
  className?: string;
}

export function MultiSelect({
  placeholder,
  options,
  checkedIds,
  onChange,
  searchPlaceholder = "Search…",
  searchable = options.length > SEARCH_THRESHOLD,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = useFiltered(options, searchable ? search : "");

  const label = (() => {
    if (checkedIds.length === 0) return placeholder;
    if (checkedIds.length === 1) {
      return options.find((option) => option.id === checkedIds[0])?.text ?? placeholder;
    }
    return `${checkedIds.length} selected`;
  })();

  const toggle = (id: string) =>
    onChange(
      checkedIds.includes(id) ? checkedIds.filter((value) => value !== id) : [...checkedIds, id],
    );

  return (
    <div className={cn("w-64", className)}>
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
      >
        <Trigger label={label} muted={checkedIds.length === 0} />
        <Surface
          search={search}
          setSearch={setSearch}
          searchPlaceholder={searchPlaceholder}
          searchable={searchable}
        >
          {checkedIds.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full cursor-pointer border-b border-rule px-3 py-2 text-left text-body text-primary transition-colors hover:text-primary-hover"
            >
              Clear selection
            </button>
          )}
          {filtered.length === 0 && EMPTY}
          {filtered.map((option) => {
            const isChecked = checkedIds.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={isChecked}
                onClick={() => toggle(option.id)}
                className={cn(rowClass, isChecked ? "text-ink" : "text-ink-2")}
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[3px] border",
                    isChecked ? "border-primary bg-primary text-white" : "border-rule-strong",
                  )}
                >
                  {isChecked && <CheckIcon width={11} height={11} />}
                </span>
                <span className="truncate">{option.text}</span>
              </button>
            );
          })}
        </Surface>
      </Popover.Root>
    </div>
  );
}
