import { useState, useRef, useEffect, useCallback } from "react";
import { S } from "../styles/theme.js";
import { validatePrompt } from "../lib/validator.js";
import { estimateCredits } from "../lib/credits.js";
import { buildFullSchema } from "../lib/schema-builder.js";
import { submitDraft, submitFinalRender, submitAudio, submitUpscale, pollGeneration, needsCharacterRef, checkPlatformSession, openPlatformLogin, submitCharRef } from "../lib/luma-client.js";
import { buildPlatformBrief } from "../lib/platform-brief.js";
import ShotSetup from "./ShotSetup.jsx";
import ProjectSettings from "./ProjectSettings.jsx";
import { applyDirectorPreset, applyAiAuteur } from "../lib/auteur.js";

const POLL_INTERVAL = 5000; // ms
const ROW_INLINE = { display: "flex", alignItems: "center", flexWrap: "wrap" };

export default function SchemaOutput({
  result,
  onUpdateShot,
  onRerunShot,
  rerunningShot = -1,
  concept = "",
  format = "",
  product = "",
  targetDuration = "",
  initialDrafts = {},
  onDraftsChange,
  characters = [],
  projectSettings = null,
  onUpdateSettings,
  onBulkUpdateShots,
}) {
  // Destructure result up front so hooks below can reference shots safely
  const { analysis, arcData, shots, validations } = result;

  const [copied, setCopied] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(-1);
  const [editingIdx, setEditingIdx] = useState(-1);
  const [editPrompt, setEditPrompt] = useState("");
  const [setupIdx, setSetupIdx] = useState(-1);
  const [reviewMode, setReviewMode] = useState(
    projectSettings?.hardStops?.beforeGenerate ?? false
  );
  const [applyingAuteur, setApplyingAuteur] = useState(false);

  // Draft generation state
  const [mode, setMode] = useState("schema"); // "schema" | "draft" | "hybrid"
  const [draftStates, setDraftStates] = useState(initialDrafts || {});
  const draftStatesRef = useRef(initialDrafts || {});
  const pollRef = useRef(null);

  const updateDraft = useCallback((idx, patch) => {
    setDraftStates((prev) => {
      const next = { ...prev, [idx]: { ...prev[idx], ...patch } };
      draftStatesRef.current = next;
      // Persist to parent (strip progressUrl — transient)
      if (onDraftsChange) {
        const persisted = {};
        Object.entries(next).forEach(([i, d]) => {
          persisted[i] = { id: d.id, state: d.state, videoUrl: d.videoUrl, approved: d.approved };
        });
        onDraftsChange(persisted);
      }
      return next;
    });
  }, [onDraftsChange]);

  // Start polling when there are active generations
  useEffect(() => {
    const hasActive = Object.values(draftStates).some(
      (d) => d.state === "queued" || d.state === "dreaming"
    );

    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        const active = Object.entries(draftStatesRef.current).filter(
          ([, d]) => d.state === "queued" || d.state === "dreaming"
        );
        if (active.length === 0) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          return;
        }
        for (const [idx, d] of active) {
          try {
            const gen = await pollGeneration(d.id);
            if (gen.state === "completed") {
              updateDraft(Number(idx), {
                state: "completed",
                videoUrl: gen.assets?.video || null,
                progressUrl: null,
              });
            } else if (gen.state === "failed") {
              updateDraft(Number(idx), {
                state: "failed",
                error: gen.failure_reason || "Generation failed",
              });
            } else {
              updateDraft(Number(idx), {
                state: gen.state,
                progressUrl: gen.assets?.progress_video || null,
              });
            }
          } catch {
            // transient poll error — keep trying
          }
        }
      }, POLL_INTERVAL);
    }

    if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {};
  }, [draftStates, updateDraft]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (finalPollRef.current) clearInterval(finalPollRef.current);
    };
  }, []);

  // ─── Final render state machine ───────────────────────────────────────────
  // { [idx]: { state, id, videoUrl, error } }
  const [finalStates, setFinalStates] = useState({});
  const finalStatesRef = useRef({});
  const finalPollRef = useRef(null);

  const updateFinal = useCallback((idx, patch) => {
    setFinalStates((prev) => {
      const next = { ...prev, [idx]: { ...prev[idx], ...patch } };
      finalStatesRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    const hasActive = Object.values(finalStates).some(
      (d) => d.state === "queued" || d.state === "dreaming"
    );
    if (hasActive && !finalPollRef.current) {
      finalPollRef.current = setInterval(async () => {
        const active = Object.entries(finalStatesRef.current).filter(
          ([, d]) => d.state === "queued" || d.state === "dreaming"
        );
        if (active.length === 0) {
          clearInterval(finalPollRef.current);
          finalPollRef.current = null;
          return;
        }
        for (const [idx, d] of active) {
          try {
            const gen = await pollGeneration(d.id);
            if (gen.state === "completed") {
              updateFinal(Number(idx), { state: "completed", videoUrl: gen.assets?.video || null });
            } else if (gen.state === "failed") {
              updateFinal(Number(idx), { state: "failed", error: gen.failure_reason || "Final render failed" });
            } else {
              updateFinal(Number(idx), { state: gen.state });
            }
          } catch {
            // transient — keep polling
          }
        }
      }, POLL_INTERVAL);
    }
    if (!hasActive && finalPollRef.current) {
      clearInterval(finalPollRef.current);
      finalPollRef.current = null;
    }
    return () => {};
  }, [finalStates, updateFinal]);

  const submitFinal = useCallback(async (idx) => {
    const draft = draftStates[idx];
    if (!draft?.id) return;
    updateFinal(idx, { state: "queued", id: null, videoUrl: null, error: null });
    try {
      const gen = await submitFinalRender(shots[idx], draft.id);
      updateFinal(idx, { state: gen.state || "queued", id: gen.id });
    } catch (e) {
      updateFinal(idx, { state: "failed", error: e.message });
    }
  }, [shots, draftStates, updateFinal]);

  const submitAllFinals = useCallback(async () => {
    const approvedIdxs = shots
      .map((_, i) => i)
      .filter((i) => draftStates[i]?.approved && draftStates[i]?.id && !needsCharacterRef(shots[i]));
    for (const idx of approvedIdxs) {
      await submitFinal(idx);
      // Stagger submissions to avoid rate limiting
      await new Promise((r) => setTimeout(r, 2000));
    }
  }, [shots, draftStates, submitFinal]);

  // ─── Post-chain state machine (audio → upscale after final render) ──────────
  // { [idx]: { phase: 'idle'|'audio'|'upscaling'|'done'|'failed', audioId, upscaleId, finalUrl, error } }
  const [chainStates, setChainStates] = useState({});
  const chainStatesRef = useRef({});
  const chainPollRef = useRef(null);

  const updateChain = useCallback((idx, patch) => {
    setChainStates((prev) => {
      const next = { ...prev, [idx]: { ...prev[idx], ...patch } };
      chainStatesRef.current = next;
      return next;
    });
  }, []);

  // Poll audio/upscale IDs
  useEffect(() => {
    const active = Object.entries(chainStates).filter(([, c]) =>
      (c.phase === 'audio' && c.audioId) || (c.phase === 'upscaling' && c.upscaleId)
    );
    if (active.length > 0 && !chainPollRef.current) {
      chainPollRef.current = setInterval(async () => {
        const entries = Object.entries(chainStatesRef.current).filter(([, c]) =>
          (c.phase === 'audio' && c.audioId) || (c.phase === 'upscaling' && c.upscaleId)
        );
        if (entries.length === 0) { clearInterval(chainPollRef.current); chainPollRef.current = null; return; }
        for (const [idx, c] of entries) {
          try {
            const pollId = c.phase === 'audio' ? c.audioId : c.upscaleId;
            const gen = await pollGeneration(pollId);
            if (gen.state === 'completed') {
              const i = Number(idx);
              const shot = shots[i];
              if (c.phase === 'audio') {
                // Audio done — now upscale if requested
                if (shot.autoUpscale && shot.autoUpscale !== 'none') {
                  try {
                    const up = await submitUpscale(c.audioId, shot.autoUpscale);
                    updateChain(i, { phase: 'upscaling', upscaleId: up.id, finalUrl: gen.assets?.video || null });
                  } catch (e) {
                    updateChain(i, { phase: 'failed', error: e.message });
                  }
                } else {
                  updateChain(i, { phase: 'done', finalUrl: gen.assets?.video || null });
                }
              } else {
                // Upscale done
                updateChain(i, { phase: 'done', finalUrl: gen.assets?.video || null });
              }
            } else if (gen.state === 'failed') {
              updateChain(Number(idx), { phase: 'failed', error: gen.failure_reason || 'Post-chain failed' });
            }
          } catch { /* transient */ }
        }
      }, POLL_INTERVAL);
    }
    if (active.length === 0 && chainPollRef.current) {
      clearInterval(chainPollRef.current);
      chainPollRef.current = null;
    }
    return () => {};
  }, [chainStates, shots, updateChain]);

  // Trigger post-chain when a final render completes
  useEffect(() => {
    Object.entries(finalStates).forEach(async ([idxStr, f]) => {
      const idx = Number(idxStr);
      if (f.state !== 'completed' || !f.id) return;
      if (chainStates[idx]) return; // already started
      const shot = shots[idx];
      if (!shot.autoAudio && !shot.autoUpscale) return;

      // Start chain
      if (shot.autoAudio) {
        try {
          const gen = await submitAudio(
            f.id,
            shot.audioPrompt || shot.audio || '',
            shot.negativeAudioPrompt || ''
          );
          updateChain(idx, { phase: 'audio', audioId: gen.id });
        } catch (e) {
          updateChain(idx, { phase: 'failed', error: e.message });
        }
      } else if (shot.autoUpscale && shot.autoUpscale !== 'none') {
        try {
          const up = await submitUpscale(f.id, shot.autoUpscale);
          updateChain(idx, { phase: 'upscaling', upscaleId: up.id });
        } catch (e) {
          updateChain(idx, { phase: 'failed', error: e.message });
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalStates]);

  // ─── Auteur application ───────────────────────────────────────────────────
  const handleApplyAuteur = useCallback(async () => {
    if (!projectSettings?.auteur || projectSettings.auteur === 'none') return;
    setApplyingAuteur(true);
    try {
      let updatedShots;
      if (projectSettings.auteur === 'ai') {
        updatedShots = await applyAiAuteur(shots, arcData, concept);
      } else {
        updatedShots = applyDirectorPreset(shots, arcData, projectSettings.auteur);
      }
      // Single bulk update — avoids React stale closure when looping setFinalResult
      if (onBulkUpdateShots) {
        onBulkUpdateShots(updatedShots);
      } else {
        updatedShots.forEach((s, i) => { if (onUpdateShot) onUpdateShot(i, s); });
      }
    } catch (e) {
      console.error('Auteur application failed:', e);
    }
    setApplyingAuteur(false);
  }, [projectSettings, shots, arcData, concept, onUpdateShot]);

  // ─── REVIEW modal state ───────────────────────────────────────────────────
  const [reviewPending, setReviewPending] = useState(null); // 'draft' | 'final' | 'auto' | null

  const launchWithReview = useCallback((action, type) => {
    if (reviewMode) {
      setReviewPending(type);
      // Store the action to call on confirm
      launchWithReview._pending = action;
    } else {
      action();
    }
  }, [reviewMode]);

  const confirmReview = useCallback(() => {
    setReviewPending(null);
    if (launchWithReview._pending) {
      launchWithReview._pending();
      launchWithReview._pending = null;
    }
  }, []);

  // ─── Platform session state ───────────────────────────────────────────────
  const [platformSession, setPlatformSession] = useState(null); // null | 'checking' | 'logged-in' | 'logged-out'
  const [platformLoginOpen, setPlatformLoginOpen] = useState(false);

  const checkPlatform = useCallback(async () => {
    setPlatformSession("checking");
    try {
      const { loggedIn } = await checkPlatformSession();
      setPlatformSession(loggedIn ? "logged-in" : "logged-out");
    } catch {
      setPlatformSession("logged-out");
    }
  }, []);

  const handlePlatformLogin = useCallback(async () => {
    setPlatformLoginOpen(true);
    try {
      await openPlatformLogin();
      setPlatformSession("logged-in");
    } catch {
      setPlatformSession("logged-out");
    }
    setPlatformLoginOpen(false);
  }, []);

  const submitCharRefShot = useCallback(async (idx) => {
    const shot = shots[idx];
    // Find character from the registered characters list
    const charName = shot.characterRef?.replace(/^@/, "");
    const character = characters.find((c) => c.name === charName);
    if (!character?.imageBase64) {
      updateFinal(idx, { state: "failed", error: `No photo uploaded for @${charName}. Upload a face photo in the sidebar.` });
      return;
    }
    updateFinal(idx, { state: "queued", id: null, videoUrl: null, error: null });
    try {
      const gen = await submitCharRef(shot, character.imageBase64, character.imageExt || "jpg");
      updateFinal(idx, { state: gen.state || "queued", id: gen.id });
    } catch (e) {
      updateFinal(idx, { state: "failed", error: e.message });
    }
  }, [shots, characters, updateFinal]);

  const submitShot = useCallback(async (idx) => {
    updateDraft(idx, { state: "queued", id: null, videoUrl: null, error: null });
    try {
      const gen = await submitDraft(shots[idx]);
      updateDraft(idx, { state: gen.state || "queued", id: gen.id });
    } catch (e) {
      updateDraft(idx, { state: "failed", error: e.message });
    }
  }, [shots, updateDraft]);

  const submitAll = useCallback(async () => {
    for (let i = 0; i < shots.length; i++) {
      await submitShot(i);
    }
  }, [shots, submitShot]);

  // ─── Full auto: draft all → auto-approve → submit finals ─────────────────
  const [fullAutoActive, setFullAutoActive] = useState(false);
  const fullAutoRef = useRef(false);

  useEffect(() => {
    if (!fullAutoRef.current) return;
    const allSettled = shots.every((_, i) => {
      const d = draftStatesRef.current[i];
      return d?.state === "completed" || d?.state === "failed";
    });
    if (!allSettled) return;

    // Auto-approve all completed drafts, then submit finals
    fullAutoRef.current = false;
    setFullAutoActive(false);
    shots.forEach((s, i) => {
      const d = draftStatesRef.current[i];
      if (d?.state === "completed" && !needsCharacterRef(s)) {
        updateDraft(i, { approved: true });
      }
    });
    // Staggered submission to avoid rate limiting
    setTimeout(async () => {
      const toSubmit = shots
        .map((s, i) => ({ s, i }))
        .filter(({ s, i }) => {
          const d = draftStatesRef.current[i];
          return d?.state === "completed" && !needsCharacterRef(s) && d?.id;
        });
      for (const { i } of toSubmit) {
        await submitFinal(i);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }, 500);
  }, [draftStates, shots, updateDraft, submitFinal]);

  const runFullAuto = useCallback(async () => {
    setMode("hybrid");
    setFullAutoActive(true);
    fullAutoRef.current = true;
    for (let i = 0; i < shots.length; i++) {
      await submitShot(i);
    }
  }, [shots, submitShot]);

  const schema = buildFullSchema(concept, format, product, targetDuration, analysis, arcData, shots, validations);

  const handleCopyAll = () => {
    navigator.clipboard.writeText(schema);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSchema = () => {
    const blob = new Blob([schema], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `luma-schema-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJSON = () => {
    const blob = new Blob([JSON.stringify(shots, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `luma-shots-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadBrief = () => {
    const brief = buildPlatformBrief(shots, draftStates, arcData, concept);
    const blob = new Blob([brief], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `luma-platform-brief-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyPrompt = (i) => {
    navigator.clipboard.writeText(shots[i]?.prompt || "");
    setCopiedIdx(i);
    setTimeout(() => setCopiedIdx(-1), 1500);
  };

  const startEdit = (i) => {
    setEditingIdx(i);
    setEditPrompt(shots[i]?.prompt || "");
  };

  const saveEdit = (i) => {
    if (onUpdateShot) onUpdateShot(i, { ...shots[i], prompt: editPrompt });
    setEditingIdx(-1);
  };

  const editValidation = editingIdx >= 0 ? validatePrompt(editPrompt) : null;

  const activeCount = Object.values(draftStates).filter(
    (d) => d.state === "queued" || d.state === "dreaming"
  ).length;
  const completedCount = Object.values(draftStates).filter((d) => d.state === "completed").length;
  const approvedCount = Object.values(draftStates).filter((d) => d.approved).length;

  const finalActiveCount = Object.values(finalStates).filter(
    (d) => d.state === "queued" || d.state === "dreaming"
  ).length;
  const finalCompletedCount = Object.values(finalStates).filter((d) => d.state === "completed").length;
  const approvedSubmittableCount = shots.filter(
    (s, i) => draftStates[i]?.approved && draftStates[i]?.id && !needsCharacterRef(s)
  ).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Project Settings */}
      {projectSettings && (
        <ProjectSettings
          settings={projectSettings}
          onUpdate={onUpdateSettings}
          onApplyAuteur={handleApplyAuteur}
          applyingAuteur={applyingAuteur}
          shots={shots}
        />
      )}

      {/* Mode tabs */}
      <div style={{ display: "flex", gap: "2px", borderBottom: "1px solid rgba(232,228,222,0.06)", paddingBottom: "12px" }}>
        {[["schema", "SCHEMA"], ["draft", "DRAFT API"], ["hybrid", "HYBRID"]].map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              ...S.btnSec,
              fontSize: "9px",
              padding: "5px 12px",
              letterSpacing: "1.5px",
              background: mode === m ? "rgba(232,228,222,0.08)" : "transparent",
              borderColor: mode === m ? "rgba(232,228,222,0.2)" : "rgba(232,228,222,0.06)",
              color: mode === m ? "#e8e4de" : "rgba(232,228,222,0.35)",
            }}
          >
            {label}
          </button>
        ))}
        <button
          onClick={runFullAuto}
          disabled={fullAutoActive || activeCount > 0 || finalActiveCount > 0}
          style={{
            ...S.btnSec,
            fontSize: "9px",
            padding: "5px 12px",
            letterSpacing: "1.5px",
            marginLeft: "8px",
            color: fullAutoActive ? "#b89c4a" : "#5a9a6a",
            borderColor: fullAutoActive ? "rgba(184,156,74,0.3)" : "rgba(90,154,106,0.3)",
            background: fullAutoActive ? "rgba(184,156,74,0.05)" : "rgba(90,154,106,0.05)",
            animation: fullAutoActive ? "pulse 1.5s infinite" : "none",
          }}
        >
          {fullAutoActive ? "AUTO RUNNING…" : "⚡ FULL AUTO"}
        </button>
        <button
          onClick={() => setReviewMode((r) => !r)}
          style={{
            ...S.btnSec,
            fontSize: "9px",
            padding: "5px 12px",
            letterSpacing: "1.5px",
            marginLeft: "4px",
            color: reviewMode ? "#b89c4a" : "rgba(232,228,222,0.25)",
            borderColor: reviewMode ? "rgba(184,156,74,0.3)" : "rgba(232,228,222,0.06)",
            background: reviewMode ? "rgba(184,156,74,0.05)" : "transparent",
          }}
          title="Pause before execution to review all settings"
        >
          {reviewMode ? "✓ REVIEW" : "REVIEW"}
        </button>
        {mode !== "schema" && (
          <span style={{ ...S.mono, fontSize: "9px", ...S.dim, marginLeft: "10px", alignSelf: "center" }}>
            {activeCount > 0
              ? `${activeCount} drafting…`
              : completedCount > 0
              ? `${completedCount}/${shots.length} drafts`
              : "540p · T2V"}
            {mode === "hybrid" && approvedCount > 0 && ` · ${approvedCount} approved`}
            {mode === "hybrid" && finalActiveCount > 0 && ` · ${finalActiveCount} rendering 1080p…`}
            {mode === "hybrid" && finalCompletedCount > 0 && finalActiveCount === 0 && ` · ${finalCompletedCount} finals ready`}
          </span>
        )}
      </div>

      {/* Action bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ ...S.mono, fontSize: "10px", ...S.dim, letterSpacing: "1px" }}>
          {shots.length} SHOTS · {estimateCredits(shots).toLocaleString()} CREDITS
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {mode !== "schema" && (
            <button
              onClick={() => launchWithReview(submitAll, "draft")}
              disabled={activeCount > 0}
              style={{
                ...S.btnSec,
                fontSize: "9px",
                padding: "8px 14px",
                color: activeCount > 0 ? "#b89c4a" : undefined,
                borderColor: activeCount > 0 ? "rgba(184,156,74,0.3)" : undefined,
                animation: activeCount > 0 ? "pulse 1.5s infinite" : "none",
              }}
            >
              {activeCount > 0 ? `GENERATING ${activeCount}…` : completedCount > 0 ? "↻ REGENERATE ALL" : "▷ GENERATE ALL DRAFTS"}
            </button>
          )}
          <button onClick={handleDownloadJSON} style={{ ...S.btnSec, fontSize: "9px", padding: "8px 14px" }}>
            ↓ JSON
          </button>
          <button onClick={handleDownloadSchema} style={{ ...S.btnSec, fontSize: "9px", padding: "8px 14px" }}>
            ↓ .TXT
          </button>
          {mode === "hybrid" && approvedSubmittableCount > 0 && finalActiveCount === 0 && (
            <button
              onClick={() => launchWithReview(submitAllFinals, "final")}
              style={{
                ...S.btnSec,
                fontSize: "9px",
                padding: "8px 14px",
                color: finalCompletedCount > 0 ? "#5a9a6a" : "#b89c4a",
                borderColor: finalCompletedCount > 0 ? "rgba(90,154,106,0.3)" : "rgba(184,156,74,0.3)",
              }}
            >
              {finalCompletedCount > 0
                ? `↻ RE-RENDER FINALS (${approvedSubmittableCount})`
                : `⬆ SUBMIT ${approvedSubmittableCount} FOR FINAL RENDER`}
            </button>
          )}
          {mode === "hybrid" && finalActiveCount > 0 && (
            <button disabled style={{ ...S.btnSec, fontSize: "9px", padding: "8px 14px", color: "#b89c4a", borderColor: "rgba(184,156,74,0.3)", animation: "pulse 1.5s infinite" }}>
              RENDERING {finalActiveCount}… 1080p
            </button>
          )}
          {mode === "hybrid" && approvedCount > 0 && (
            <button
              onClick={handleDownloadBrief}
              style={{
                ...S.btnSec,
                fontSize: "9px",
                padding: "8px 14px",
                color: "#5a9a6a",
                borderColor: "rgba(90,154,106,0.3)",
              }}
            >
              ↓ PLATFORM BRIEF ({approvedCount})
            </button>
          )}
          <button onClick={handleCopyAll} style={S.btnPrimary}>
            {copied ? "✓ COPIED FULL SCHEMA" : "⧉ COPY PRODUCTION SCHEMA"}
          </button>
        </div>
      </div>

      {/* Per-shot cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {shots.map((s, i) => {
          const v = validations?.[i] || { score: 0, wordCount: 0, issues: [] };
          const isEditing = editingIdx === i;
          return (
            <div
              key={i}
              style={{
                ...S.card,
                padding: "12px 16px",
                borderLeft: `2px solid ${
                  v.score >= 75
                    ? "rgba(90,154,106,0.3)"
                    : v.score >= 50
                    ? "rgba(184,156,74,0.3)"
                    : "rgba(192,86,74,0.3)"
                }`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                  <span style={{ ...S.mono, fontSize: "10px", ...S.dim }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span style={{ ...S.mono, fontSize: "12px", ...S.bright }}>{s.name}</span>
                  <span style={{ ...S.mono, fontSize: "9px", ...S.dim }}>
                    {s.model} · {s.mode} · {s.aspect} · {s.duration}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <span
                    style={{
                      ...S.mono,
                      fontSize: "9px",
                      color:
                        v.score >= 75 ? "#5a9a6a" : v.score >= 50 ? "#b89c4a" : "#c0564a",
                    }}
                  >
                    {v.score}/100 [{v.wordCount}w]
                  </span>
                  <button
                    onClick={() => (isEditing ? saveEdit(i) : startEdit(i))}
                    style={{ ...S.btnSec, padding: "4px 10px", fontSize: "8px" }}
                  >
                    {isEditing ? "SAVE" : "EDIT"}
                  </button>
                  <button
                    onClick={() => setSetupIdx(setupIdx === i ? -1 : i)}
                    style={{
                      ...S.btnSec, padding: "4px 10px", fontSize: "8px",
                      color: setupIdx === i ? "#b89c4a" : undefined,
                      borderColor: setupIdx === i ? "rgba(184,156,74,0.3)" : undefined,
                      background: setupIdx === i ? "rgba(184,156,74,0.05)" : undefined,
                    }}
                  >
                    SETUP
                  </button>
                  <button
                    onClick={() => handleCopyPrompt(i)}
                    style={{ ...S.btnSec, padding: "4px 10px", fontSize: "8px" }}
                  >
                    {copiedIdx === i ? "✓" : "COPY"}
                  </button>
                  {onRerunShot && (
                    <button
                      onClick={() => rerunningShot === -1 && onRerunShot(i)}
                      disabled={rerunningShot >= 0}
                      style={{
                        ...S.btnSec,
                        padding: "4px 10px",
                        fontSize: "8px",
                        color: rerunningShot === i ? "#b89c4a" : undefined,
                        borderColor: rerunningShot === i ? "rgba(184,156,74,0.3)" : undefined,
                        animation: rerunningShot === i ? "pulse 1.5s infinite" : "none",
                      }}
                      title="Regenerate this shot (arc context frozen)"
                    >
                      {rerunningShot === i ? "…" : "↻"}
                    </button>
                  )}
                </div>
              </div>

              {isEditing ? (
                <div>
                  <textarea
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    style={{ ...S.input, minHeight: "60px", fontSize: "11px", lineHeight: "1.6" }}
                  />
                  {editValidation && editValidation.issues.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
                      {editValidation.issues.map((iss, j) => (
                        <span
                          key={j}
                          style={{
                            ...S.mono,
                            fontSize: "9px",
                            padding: "2px 8px",
                            borderRadius: "2px",
                            background:
                              iss.sev === "error"
                                ? "rgba(192,86,74,0.1)"
                                : "rgba(184,156,74,0.1)",
                            color: iss.sev === "error" ? "#c0564a" : "#b89c4a",
                          }}
                        >
                          {iss.msg}
                        </span>
                      ))}
                    </div>
                  )}
                  {editValidation && (
                    <div
                      style={{
                        ...S.mono,
                        fontSize: "9px",
                        marginTop: "4px",
                        color: editValidation.score >= 75 ? "#5a9a6a" : "#b89c4a",
                      }}
                    >
                      {editValidation.wordCount}w · {editValidation.score}/100
                    </div>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    ...S.mono,
                    fontSize: "11px",
                    color: "rgba(232,228,222,0.6)",
                    lineHeight: "1.6",
                    padding: "6px 10px",
                    background: "rgba(0,0,0,0.2)",
                    borderRadius: "3px",
                  }}
                >
                  {s.prompt}
                </div>
              )}

              {/* SETUP panel */}
              <ShotSetup
                shot={s}
                isOpen={setupIdx === i}
                onToggle={() => setSetupIdx(setupIdx === i ? -1 : i)}
                projectDefaults={projectSettings?.defaults || {}}
                onUpdate={(updatedShot) => {
                  if (onUpdateShot) onUpdateShot(i, updatedShot);
                }}
              />

              {/* Draft generation panel */}
              {mode !== "schema" && (() => {
                const d = draftStates[i] || { state: "idle" };
                const hasCharRef = needsCharacterRef(s);
                return (
                  <div style={{ marginTop: "10px", borderTop: "1px solid rgba(232,228,222,0.05)", paddingTop: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: d.videoUrl ? "8px" : 0 }}>
                      {/* Status badge */}
                      <span style={{
                        ...S.mono, fontSize: "8px", letterSpacing: "1px", padding: "2px 8px", borderRadius: "2px",
                        background: d.state === "completed" ? "rgba(90,154,106,0.1)"
                          : d.state === "failed" ? "rgba(192,86,74,0.1)"
                          : d.state === "queued" || d.state === "dreaming" ? "rgba(184,156,74,0.1)"
                          : "rgba(232,228,222,0.04)",
                        color: d.state === "completed" ? "#5a9a6a"
                          : d.state === "failed" ? "#c0564a"
                          : d.state === "queued" || d.state === "dreaming" ? "#b89c4a"
                          : "rgba(232,228,222,0.25)",
                        animation: (d.state === "queued" || d.state === "dreaming") ? "pulse 1.5s infinite" : "none",
                      }}>
                        {d.state === "idle" ? "DRAFT READY"
                          : d.state === "queued" ? "QUEUED"
                          : d.state === "dreaming" ? "DREAMING…"
                          : d.state === "completed" ? "✓ COMPLETE"
                          : d.state === "failed" ? "✕ FAILED"
                          : d.state.toUpperCase()}
                      </span>

                      {/* Character ref warning */}
                      {hasCharRef && (
                        <span style={{ ...S.mono, fontSize: "8px", color: "#b89c4a" }}>
                          ⚠ char ref — T2V only
                        </span>
                      )}

                      {/* Per-shot generate / retry button */}
                      {(d.state === "idle" || d.state === "failed") && (
                        <button
                          onClick={() => submitShot(i)}
                          style={{ ...S.btnSec, padding: "3px 9px", fontSize: "8px" }}
                        >
                          {d.state === "failed" ? "↻ RETRY" : "▷"}
                        </button>
                      )}

                      {/* Error message */}
                      {d.state === "failed" && d.error && (
                        <span style={{ ...S.mono, fontSize: "8px", color: "#c0564a" }}>{d.error}</span>
                      )}

                      {/* Hybrid approve toggle */}
                      {mode === "hybrid" && d.state === "completed" && (
                        <button
                          onClick={() => updateDraft(i, { approved: !d.approved })}
                          style={{
                            ...S.btnSec, padding: "3px 9px", fontSize: "8px", marginLeft: "auto",
                            color: d.approved ? "#5a9a6a" : undefined,
                            borderColor: d.approved ? "rgba(90,154,106,0.3)" : undefined,
                            background: d.approved ? "rgba(90,154,106,0.08)" : undefined,
                          }}
                        >
                          {d.approved ? "✓ APPROVED" : "APPROVE FOR PLATFORM"}
                        </button>
                      )}
                    </div>

                    {/* Progress video (while dreaming) */}
                    {d.progressUrl && !d.videoUrl && (
                      <video
                        src={d.progressUrl}
                        autoPlay muted loop playsInline
                        style={{ width: "100%", borderRadius: "3px", marginTop: "6px", opacity: 0.6 }}
                      />
                    )}

                    {/* Completed draft video */}
                    {d.videoUrl && (
                      <video
                        src={d.videoUrl}
                        controls autoPlay muted loop playsInline
                        style={{ width: "100%", borderRadius: "3px", marginTop: "6px" }}
                      />
                    )}
                  </div>
                );
              })()}

              {/* Final render panel — HYBRID mode, approved shots only */}
              {mode === "hybrid" && draftStates[i]?.approved && (() => {
                const f = finalStates[i] || { state: "idle" };
                const hasCharRef = needsCharacterRef(s);
                return (
                  <div style={{ marginTop: "8px", borderTop: "1px solid rgba(90,154,106,0.1)", paddingTop: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: f.videoUrl ? "8px" : 0 }}>
                      <span style={{ ...S.mono, fontSize: "8px", letterSpacing: "1.5px", color: "rgba(90,154,106,0.6)" }}>
                        1080p FINAL
                      </span>
                      <span style={{
                        ...S.mono, fontSize: "8px", letterSpacing: "1px", padding: "2px 8px", borderRadius: "2px",
                        background: f.state === "completed" ? "rgba(90,154,106,0.12)"
                          : f.state === "failed" ? "rgba(192,86,74,0.1)"
                          : f.state === "queued" || f.state === "dreaming" ? "rgba(184,156,74,0.1)"
                          : "rgba(232,228,222,0.04)",
                        color: f.state === "completed" ? "#5a9a6a"
                          : f.state === "failed" ? "#c0564a"
                          : f.state === "queued" || f.state === "dreaming" ? "#b89c4a"
                          : "rgba(232,228,222,0.2)",
                        animation: (f.state === "queued" || f.state === "dreaming") ? "pulse 1.5s infinite" : "none",
                      }}>
                        {hasCharRef ? "PLATFORM ONLY"
                          : f.state === "idle" ? "READY TO RENDER"
                          : f.state === "queued" ? "QUEUED"
                          : f.state === "dreaming" ? "RENDERING…"
                          : f.state === "completed" ? "✓ 1080p READY"
                          : f.state === "failed" ? "✕ FAILED"
                          : f.state.toUpperCase()}
                      </span>
                      {!hasCharRef && (f.state === "idle" || f.state === "failed") && draftStates[i]?.id && (
                        <button onClick={() => submitFinal(i)} style={{ ...S.btnSec, padding: "3px 9px", fontSize: "8px" }}>
                          {f.state === "failed" ? "↻ RETRY" : "⬆ RENDER"}
                        </button>
                      )}
                      {f.state === "failed" && f.error && (
                        <span style={{ ...S.mono, fontSize: "8px", color: "#c0564a" }}>{f.error}</span>
                      )}
                      {hasCharRef && f.state === "idle" && (() => {
                        const charName = s.characterRef?.replace(/^@/, "");
                        const char = characters.find((c) => c.name === charName);
                        const hasPhoto = !!char?.imageBase64;
                        if (!hasPhoto) return (
                          <span style={{ ...S.mono, fontSize: "8px", color: "#b89c4a" }}>
                            upload photo for @{charName} in sidebar
                          </span>
                        );
                        if (platformSession === null) return (
                          <button onClick={checkPlatform} style={{ ...S.btnSec, padding: "3px 9px", fontSize: "8px" }}>
                            CHECK SESSION
                          </button>
                        );
                        if (platformSession === "checking") return (
                          <span style={{ ...S.mono, fontSize: "8px", color: "#b89c4a" }}>checking…</span>
                        );
                        if (platformSession === "logged-out") return (
                          <button onClick={handlePlatformLogin} disabled={platformLoginOpen} style={{ ...S.btnSec, padding: "3px 9px", fontSize: "8px", color: "#b89c4a", borderColor: "rgba(184,156,74,0.3)" }}>
                            {platformLoginOpen ? "BROWSER OPEN — LOG IN…" : "LOG IN TO PLATFORM"}
                          </button>
                        );
                        return (
                          <button onClick={() => submitCharRefShot(i)} style={{ ...S.btnSec, padding: "3px 9px", fontSize: "8px", color: "#5a9a6a", borderColor: "rgba(90,154,106,0.3)" }}>
                            ⬆ SUBMIT WITH CHAR REF
                          </button>
                        );
                      })()}
                    </div>
                    {f.videoUrl && (
                      <video
                        src={f.videoUrl}
                        controls autoPlay muted loop playsInline
                        style={{ width: "100%", borderRadius: "3px", border: "1px solid rgba(90,154,106,0.15)" }}
                      />
                    )}
                  </div>
                );
              })()}

              {/* Vision + Audio + Cut */}
              <div style={{ display: "flex", gap: "16px", marginTop: "8px", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <span style={{ ...S.mono, fontSize: "8px", ...S.dim, letterSpacing: "1.5px" }}>
                    VISION{" "}
                  </span>
                  <span style={{ fontSize: "10px", ...S.mid }}>{s.vision}</span>
                </div>
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <span style={{ ...S.mono, fontSize: "8px", ...S.dim, letterSpacing: "1.5px" }}>
                    AUDIO{" "}
                  </span>
                  <span style={{ fontSize: "10px", ...S.mid }}>{s.audio}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "16px", marginTop: "4px", flexWrap: "wrap" }}>
                <div>
                  <span style={{ ...S.mono, fontSize: "8px", ...S.dim, letterSpacing: "1.5px" }}>
                    CUT →{" "}
                  </span>
                  <span style={{ fontSize: "10px", ...S.mid }}>{s.cutType}</span>
                </div>
                <div>
                  <span style={{ ...S.mono, fontSize: "8px", ...S.dim, letterSpacing: "1.5px" }}>
                    RISK{" "}
                  </span>
                  <span style={{ fontSize: "10px", ...S.mid }}>{s.knownRisk}</span>
                </div>
                <div>
                  <span style={{ ...S.mono, fontSize: "8px", ...S.dim, letterSpacing: "1.5px" }}>
                    CHANGE{" "}
                  </span>
                  <span style={{ fontSize: "10px", ...S.mid }}>{s.change}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Post-chain status strip */}
      {Object.entries(chainStates).some(([, c]) => c.phase !== 'done') && (
        <div style={{ ...S.card, padding: "10px 16px", display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ ...S.mono, fontSize: "8px", letterSpacing: "2px", ...S.dim, marginBottom: "2px" }}>POST-CHAIN</div>
          {Object.entries(chainStates).map(([idx, c]) => {
            const s = shots[Number(idx)];
            if (!s || c.phase === 'idle') return null;
            return (
              <div key={idx} style={{ ...ROW_INLINE, gap: "8px" }}>
                <span style={{ ...S.mono, fontSize: "9px", ...S.dim }}>
                  {String(Number(idx) + 1).padStart(2, "0")} {s.name}
                </span>
                <span style={{
                  ...S.mono, fontSize: "8px", padding: "1px 6px", borderRadius: "2px",
                  color: c.phase === 'done' ? "#5a9a6a" : c.phase === 'failed' ? "#c0564a" : "#b89c4a",
                  background: c.phase === 'done' ? "rgba(90,154,106,0.08)" : c.phase === 'failed' ? "rgba(192,86,74,0.08)" : "rgba(184,156,74,0.08)",
                  animation: (c.phase === 'audio' || c.phase === 'upscaling') ? "pulse 1.5s infinite" : "none",
                }}>
                  {c.phase === 'audio' ? "ADDING AUDIO…" : c.phase === 'upscaling' ? `UPSCALING ${shots[Number(idx)]?.autoUpscale || ''}…` : c.phase === 'done' ? "✓ CHAIN COMPLETE" : `✕ ${c.error}`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* REVIEW modal */}
      {reviewPending && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            ...S.card, padding: "24px", maxWidth: "700px", width: "90vw",
            maxHeight: "80vh", overflow: "auto",
            borderColor: "rgba(184,156,74,0.2)",
          }}>
            <div style={{ ...S.mono, fontSize: "10px", letterSpacing: "3px", color: "#b89c4a", marginBottom: "16px" }}>
              REVIEW BEFORE LAUNCH — {reviewPending.toUpperCase()}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ ...S.mono, fontSize: "8px", ...S.dim, letterSpacing: "1px" }}>
                  {["#", "SHOT", "MODEL", "RANGE", "CAMERA", "DUR", "AUDIO", "POST-CHAIN"].map((h) => (
                    <td key={h} style={{ padding: "4px 8px", borderBottom: "1px solid rgba(232,228,222,0.06)" }}>{h}</td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shots.map((s, i) => (
                  <tr key={i} style={{ ...S.mono, fontSize: "9px" }}>
                    <td style={{ padding: "6px 8px", ...S.dim }}>{String(i + 1).padStart(2, "0")}</td>
                    <td style={{ padding: "6px 8px", color: "#e8e4de", maxWidth: "140px" }}>{s.name}</td>
                    <td style={{ padding: "6px 8px", ...S.mid }}>{s.model}</td>
                    <td style={{ padding: "6px 8px", ...S.dim, color: s.dynamicRange === 'hdr' ? "#b89c4a" : undefined }}>{s.dynamicRange || "std"}</td>
                    <td style={{ padding: "6px 8px", ...S.dim }}>{s.cameraControl || "—"}</td>
                    <td style={{ padding: "6px 8px", ...S.dim }}>{s.duration}</td>
                    <td style={{ padding: "6px 8px", ...S.dim, maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.autoAudio ? (s.audioPrompt || s.audio || "from schema") : "—"}
                    </td>
                    <td style={{ padding: "6px 8px", ...S.dim }}>
                      {[s.autoAudio && "audio", s.autoUpscale && s.autoUpscale !== "none" && s.autoUpscale, s.autoExtend && "extend"].filter(Boolean).join(" → ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", gap: "8px", marginTop: "20px", justifyContent: "flex-end" }}>
              <button onClick={() => setReviewPending(null)} style={{ ...S.btnSec, fontSize: "9px", padding: "8px 16px" }}>
                ADJUST
              </button>
              <button onClick={confirmReview} style={{
                ...S.btnPrimary, fontSize: "9px", padding: "8px 20px",
                color: "#b89c4a", borderColor: "rgba(184,156,74,0.4)",
                background: "rgba(184,156,74,0.08)",
              }}>
                ⚡ LAUNCH
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Raw schema expandable */}
      <details style={{ ...S.card }}>
        <summary
          style={{
            ...S.mono,
            fontSize: "10px",
            ...S.dim,
            letterSpacing: "2px",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          RAW SCHEMA TEXT
        </summary>
        <pre
          style={{
            marginTop: "12px",
            padding: "16px",
            background: "rgba(0,0,0,0.3)",
            borderRadius: "3px",
            ...S.mono,
            fontSize: "10px",
            color: "rgba(232,228,222,0.5)",
            lineHeight: "1.5",
            overflow: "auto",
            maxHeight: "500px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {schema}
        </pre>
      </details>
    </div>
  );
}
