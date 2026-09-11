"use client";
import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CaretRight, X, UsersThree, type Icon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useDragControls, useReducedMotion } from "motion/react";

export function Avatar({
  name,
  url,
  large = false,
}: {
  name: string;
  url?: string | null;
  large?: boolean;
}) {
  return (
    <span className={`avatar tone0 ${large ? "large" : ""}`}>
      {url ? (
        <Image
          className="avatar-image"
          src={url}
          alt={name}
          width={72}
          height={72}
          unoptimized
        />
      ) : (
        name.slice(0, 1)
      )}
    </span>
  );
}
export function Row({
  title,
  sub,
  icon: Icon = UsersThree,
  onClick,
}: {
  title: string;
  sub?: string;
  icon?: Icon;
  onClick: () => void;
}) {
  return (
    <button className="link-row" onClick={onClick}>
      <Icon size={25} weight="duotone" />
      <span>
        <strong>{title}</strong>
        {sub && <small>{sub}</small>}
      </span>
      <CaretRight size={18} />
    </button>
  );
}
type SheetProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
  open?: boolean;
};
export function Sheet({ open = true, ...props }: SheetProps) {
  return <AnimatePresence>{open && <SheetDialog {...props} />}</AnimatePresence>;
}
function SheetDialog({ title, onClose, children, busy = false }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const controls = useDragControls();
  const reduced = useReducedMotion();
  // Numeric offsets avoid transform remeasurement when the draggable dialog opens.
  const [travel] = useState(() => typeof window === "undefined" ? 1000 : window.innerHeight + 36);
  useEffect(() => {
    const node = ref.current;
    node?.showModal();
    return () => { if (node?.open) node.close(); };
  }, []);
  const close = () => { if (!busy) onClose(); };
  return (
    <dialog ref={ref} aria-label={title} className="prototype-sheet"
      onCancel={e => { e.preventDefault(); close(); }}>
      <motion.div className="sheet-shade" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.16 }} onClick={close} />
      <motion.div className="sheet-panel" style={{ touchAction: "pan-y" }}
        initial={{ y: reduced ? 0 : travel }} animate={{ y: 0 }}
        exit={{ y: reduced ? 0 : travel, transition: { type: "tween", duration: reduced ? 0 : 0.24, ease: [0.4, 0, 1, 1] } }}
        transition={{ type: "tween", duration: reduced ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
        drag={busy ? false : "y"} dragControls={controls} dragListener={false}
        dragMomentum={false} dragTransition={{ bounceStiffness: 500, bounceDamping: 50 }}
        dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={(_, info) => { if (info.offset.y > 96 || info.velocity.y > 550) close(); }}>
        <div className="sheet-handle-zone" onPointerDown={e => controls.start(e)}><div className="sheet-handle" /></div>
        <header><h2>{title}</h2><button disabled={busy} className="icon-button" aria-label="Close" onClick={close}><X size={22} /></button></header>
        <fieldset disabled={busy} className="sheet-content">{children}</fieldset>
      </motion.div>
    </dialog>
  );
}
export function ErrorText({ error }: { error: string }) {
  return error ? (
    <p role="alert" className="prototype-error">
      {error}
    </p>
  ) : null;
}
