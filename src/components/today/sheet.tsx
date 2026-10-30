import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconButton } from "../icon-button";
import { CloseIcon } from "../icons";

/** Bottom sheet on a native modal <dialog>: focus trap and Escape for free. */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    // Start on the sheet itself, so neither a field (and the keyboard) nor
    // the close button is focused right away.
    dialog.focus();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      tabIndex={-1}
      className="sheet"
      onClose={onClose}
      onClick={(event) => {
        // A click on the dialog itself (not its content) is the backdrop.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex items-center justify-between pt-2 pr-3 pl-5">
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        <IconButton label="Close" onClick={onClose}>
          <CloseIcon className="size-5" />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
