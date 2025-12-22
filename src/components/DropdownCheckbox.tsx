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
        <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {options.map((opt) => (
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
      )}
    </div>
  );
}
