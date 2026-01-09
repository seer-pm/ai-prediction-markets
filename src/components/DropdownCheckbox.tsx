import { useEffect, useRef, useState } from "react";

type Option = {
  id: string;
  text: string;
};

type Props = {
  placeholder: string;
  options: Option[];
  checkedIds: Array<string>;
  onChange: (ids: Array<string>) => void;
};

export default function DropdownCheckbox({ placeholder, options, checkedIds, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (id: string) => {
    if (checkedIds.includes(id)) {
      onChange(checkedIds.filter((x) => x !== id));
    } else {
      onChange([...checkedIds, id]);
    }
  };

  const selectedTexts = options.filter((o) => checkedIds.includes(o.id)).map((o) => o.text);

  const buttonLabel = () => {
    if (selectedTexts.length === 0) return placeholder;
    if (selectedTexts.length <= 2) return selectedTexts.join(", ");
    return `${selectedTexts.slice(0, 2).join(", ")} +${selectedTexts.length - 2} more`;
  };

  const filteredOptions = options.filter((o) =>
    o.text.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={ref} className="relative w-64">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full whitespace-nowrap cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {buttonLabel()}
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
          {/* Search input */}
          <div className="relative p-2 border-b border-gray-200">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full rounded-md border border-gray-300 px-2 py-1 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute cursor-pointer right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
              >
                ×
              </button>
            )}
          </div>

          {/* Options */}
          <div className="max-h-52 overflow-auto">
            {filteredOptions.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-500">No results</div>
            )}

            {filteredOptions.map((opt) => (
              <label
                key={opt.id}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100"
              >
                <input
                  type="checkbox"
                  checked={checkedIds.includes(opt.id)}
                  onChange={() => toggle(opt.id)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-700">{opt.text}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
