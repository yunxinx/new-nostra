import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { AppError } from "@/types/ipc";

import { resolveSettingsClose } from "@/lib/ipc/windows";

export function useSettingsClose(onRequest: () => void) {
  const [registration, setRegistration] = useState<{
    attempt: number;
    status: "failed" | "pending" | "ready";
  }>({ attempt: 0, status: "pending" });
  const isResolvingRef = useRef(false);
  const requestClose = useEffectEvent(onRequest);
  const options: UseMutationOptions<void, AppError, boolean> = {
    mutationFn: resolveSettingsClose,
    networkMode: "always",
    retry: false,
  };
  const resolution = useMutation(options);

  useEffect(() => {
    let isDisposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onCloseRequested((event) => {
        event.preventDefault();
        if (!isDisposed) requestClose();
      })
      .then((dispose) => {
        if (isDisposed) dispose();
        else {
          unlisten = dispose;
          setRegistration((current) => ({ ...current, status: "ready" }));
        }
      })
      .catch((error: unknown) => {
        if (isDisposed) return;
        console.error("Settings close listener registration failed", error);
        setRegistration((current) => ({ ...current, status: "failed" }));
      });
    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, [registration.attempt]);

  function resolve(accepted: boolean, onSettled: () => void): void {
    if (isResolvingRef.current) return;
    isResolvingRef.current = true;
    resolution.mutate(accepted, {
      onSettled: () => {
        isResolvingRef.current = false;
        onSettled();
      },
    });
  }

  return {
    error: resolution.error,
    isCancellationError: resolution.isError && !resolution.variables,
    registrationError:
      registration.status === "failed"
        ? ({
            code: "internal",
            message: "settings close listener unavailable",
          } satisfies AppError)
        : null,
    registrationStatus: registration.status,
    resolve,
    retryRegistration: () =>
      setRegistration((current) => ({
        attempt: current.attempt + 1,
        status: "pending",
      })),
  };
}
