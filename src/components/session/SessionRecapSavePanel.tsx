"use client";

import { useEffect, useRef } from "react";
import { Download } from "lucide-react";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { downloadSessionStandingsImageBlob } from "@/lib/sessionShareImageClient";
import styles from "./SessionRecapSavePanel.module.css";

function RecapPreview({ blob, index, count }: { blob: Blob; index: number; count: number }) {
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    const image = imageRef.current;
    if (image) image.src = url;
    return () => {
      image?.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [blob]);

  // The prepared PNG is local; release its preview URL when this panel closes.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={imageRef} className={styles.preview} alt={`Recap image ${index + 1} of ${count}`} width={1080} height={1920} />;
}

export function SessionRecapSavePanel({ images, fileName, onClose }: {
  images: readonly Blob[];
  fileName: string;
  onClose: () => void;
}) {
  const download = (index: number) => downloadSessionStandingsImageBlob(images[index], fileName, index, images.length);
  return (
    <ModalFrame title="Save recap" onClose={onClose} frameClassName={styles.frame}
      footer={images.length > 1 ? <button type="button" className={styles.downloadAll}
        onClick={() => images.forEach((_, index) => download(index))}>
        <Download size={18} aria-hidden="true" />Download all
      </button> : undefined}>
      <div className={styles.pages}>
        {images.map((blob, index) => <figure className={styles.page} key={index}>
          <figcaption>{index + 1} of {images.length}</figcaption>
          <RecapPreview blob={blob} index={index} count={images.length} />
          <button type="button" className={styles.saveButton} onClick={() => download(index)}>
            <Download size={17} aria-hidden="true" />Save image {index + 1}
          </button>
        </figure>)}
      </div>
    </ModalFrame>
  );
}
