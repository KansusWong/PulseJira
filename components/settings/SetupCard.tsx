"use client";

import { useEffect, useState, useCallback } from "react";
import { EnvConfigSection, type EnvGroupInfo } from "./EnvConfigSection";
import { RefreshOverlay } from "./RefreshOverlay";

type SaveStatus = "idle" | "saving" | "refreshing" | "saved" | "error";

export function SetupCard() {
  const [groups, setGroups] = useState<EnvGroupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [showOverlay, setShowOverlay] = useState(false);

  const fetchEnvStatus = useCallback(() => {
    fetch("/api/settings/env")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data?.groups) {
          setGroups(
            (json.data.groups as EnvGroupInfo[]).filter(
              (group) => group.id !== "social"
            )
          );
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchEnvStatus();
  }, [fetchEnvStatus]);

  const handleSave = useCallback(
    async (values: Record<string, string>) => {
      setSaveStatus("saving");
      try {
        const res = await fetch("/api/settings/env", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vars: values }),
        });
        const json = await res.json();

        if (json.success) {
          setSaveStatus("refreshing");
          setShowOverlay(true);
        } else {
          setSaveStatus("error");
          setTimeout(() => setSaveStatus("idle"), 3000);
        }
      } catch {
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
    },
    []
  );

  const handleOverlayComplete = useCallback(() => {
    setShowOverlay(false);
    setSaveStatus("saved");
    // Re-fetch to reflect updated status
    fetchEnvStatus();
    setTimeout(() => setSaveStatus("idle"), 2500);
  }, [fetchEnvStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-8">
        <EnvConfigSection
          groups={groups}
          onSave={handleSave}
          saveStatus={saveStatus}
        />
      </div>
      <RefreshOverlay
        visible={showOverlay}
        onComplete={handleOverlayComplete}
      />
    </>
  );
}
