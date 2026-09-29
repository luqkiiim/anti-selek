"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchSessionStandingsImageBlob } from "./sessionShareImageClient";

interface UseSessionStandingsImageOptions {
  code: string;
  enabled: boolean;
  /** Change this when the final results change and the image needs refreshing. */
  revision?: string;
}

interface ShareImageState {
  key: string | null;
  blob: Blob | null;
  error: string;
}

const EMPTY_STATE: ShareImageState = {
  key: null,
  blob: null,
  error: "",
};

export function useSessionStandingsImage({
  code,
  enabled,
  revision,
}: UseSessionStandingsImageOptions) {
  const [state, setState] = useState<ShareImageState>(EMPTY_STATE);
  const [retryCount, setRetryCount] = useState(0);
  const requestRef = useRef<{ key: string; promise: Promise<Blob> } | null>(null);
  const retry = useCallback(() => setRetryCount((count) => count + 1), []);
  const requestKey = enabled && code
    ? JSON.stringify([code, revision ?? null, retryCount])
    : null;

  useEffect(() => {
    if (!requestKey) {
      requestRef.current = null;
      return;
    }

    let active = true;

    if (requestRef.current?.key !== requestKey) {
      requestRef.current = {
        key: requestKey,
        promise: fetchSessionStandingsImageBlob({ code }),
      };
    }

    void requestRef.current.promise
      .then((blob) => {
        if (active) {
          setState({ key: requestKey, blob, error: "" });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            key: requestKey,
            blob: null,
            error: error instanceof Error && error.message.trim()
              ? error.message
              : "Could not prepare standings image.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [code, requestKey]);

  const current = state.key === requestKey;

  return {
    blob: current ? state.blob : null,
    preparing: Boolean(requestKey) && !current,
    error: current ? state.error : "",
    retry,
  };
}
