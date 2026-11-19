import { useCallback, useEffect, useRef, useState } from "react";
import { definePluginApp, experimental_Icon as Icon, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract, TrustPrompt } from "./contract.js";
import "./app.css";

const strings = {
  en: {
    title: "Review Codex project trust",
    intro: "Codex is skipping this project's local configuration.",
    review: "Review trust",
    machine: "Machine",
    config: "Codex settings",
    scope: "Trust lets Codex load local settings, run hooks, and use rules for command execution. The decision is saved for this path on the selected machine.",
    trust: "Trust project",
    saving: "Saving…",
    cancel: "Cancel",
    unavailable: "Could not verify the Codex profile on this machine.",
    retry: "Retry",
    saved: "Project trusted",
    next: "Codex picks up this setting when its runtime starts again.",
    close: "Dismiss trust confirmation",
    failed: "Could not save project trust.",
  },
  ru: {
    title: "Доверие к проекту Codex",
    intro: "Codex пропускает локальную конфигурацию этого проекта.",
    review: "Проверить",
    machine: "Машина",
    config: "Конфигурация Codex",
    scope: "Доверие позволяет Codex загружать локальные настройки, запускать хуки и применять правила выполнения команд. Решение сохраняется для этого пути на указанной машине.",
    trust: "Доверять проекту",
    saving: "Сохраняю…",
    cancel: "Отмена",
    unavailable: "Не удалось проверить профиль Codex на этой машине.",
    retry: "Повторить",
    saved: "Проекту доверено",
    next: "Codex применит настройку при следующем запуске среды треда.",
    close: "Закрыть уведомление о доверии",
    failed: "Не удалось сохранить доверие к проекту.",
  },
};

function TrustCard({ threadId }: { threadId: string }) {
  const copy = navigator.language.startsWith("ru") ? strings.ru : strings.en;
  const rpc = useRpc<typeof rpcContract>();
  const [prompt, setPrompt] = useState<TrustPrompt | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const review = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const read = useRef(0);
  const refresh = useCallback(() => {
    const request = ++read.current;
    void rpc.call("inspect", { threadId }).then((result) => {
      if (request !== read.current) return;
      setPrompt(result);
    }).catch(() => {});
  }, [rpc, threadId]);
  useEffect(() => {
    refresh();
    return () => { read.current += 1; };
  }, [refresh]);
  useRealtime("warning", (key) => {
    if (key === threadId) refresh();
  });
  useEffect(() => {
    if (expanded) cancel.current?.focus();
  }, [expanded]);

  async function approve() {
    if (!prompt || saving || prompt.state !== "ready") return;
    setSaving(true);
    setError("");
    try {
      const { projectPath, configPath, folderPath, hostId, environmentId } = prompt;
      await rpc.call("approve", { threadId, target: { projectPath, configPath, folderPath, hostId, environmentId } });
      setSaved(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : copy.failed);
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <section className="bb-cpt bb-cpt--saved" aria-label={copy.saved}>
        <span className="bb-cpt__icon" aria-hidden="true"><Icon name="ShieldCheck" /></span>
        <div className="bb-cpt__body" role="status"><strong>{copy.saved}</strong><p>{copy.next}</p></div>
        <button className="bb-cpt__icon-button" aria-label={copy.close} onClick={() => { setPrompt(null); setSaved(false); setExpanded(false); refresh(); }}>
          <Icon name="X" aria-hidden="true" />
        </button>
      </section>
    );
  }
  if (!prompt) return null;
  const ready = prompt.state === "ready";
  return (
    <section className="bb-cpt" aria-label={copy.title} aria-busy={saving}>
      <span className="bb-cpt__icon" aria-hidden="true"><Icon name="ShieldAlert" /></span>
      <div className="bb-cpt__body">
        <strong>{copy.title}</strong>
        <p>{ready ? copy.intro : copy.unavailable}</p>
        <code className="bb-cpt__path" dir="ltr" title={prompt.projectPath}>{prompt.projectPath}</code>
        {expanded && ready && (
          <div className="bb-cpt__details" onKeyDown={(event) => {
            if (event.key === "Escape" && !saving) {
              event.stopPropagation();
              setExpanded(false);
              requestAnimationFrame(() => review.current?.focus());
            }
          }}>
            <dl>
              <dt>{copy.machine}</dt><dd>{prompt.machine}</dd>
              <dt>{copy.config}</dt><dd><code dir="ltr">{prompt.configPath}</code></dd>
            </dl>
            <p>{copy.scope}</p>
            {error && <p className="bb-cpt__error" role="alert">{error}</p>}
            <div className="bb-cpt__actions">
              <button ref={cancel} disabled={saving} onClick={() => { setExpanded(false); setError(""); requestAnimationFrame(() => review.current?.focus()); }}>{copy.cancel}</button>
              <button className="bb-cpt__primary" disabled={saving} onClick={() => void approve()}>{saving ? copy.saving : copy.trust}</button>
            </div>
          </div>
        )}
      </div>
      {ready ? !expanded && (
        <button className="bb-cpt__review" ref={review} aria-expanded={false} onClick={() => setExpanded(true)}>{copy.review}</button>
      ) : (
        <button className="bb-cpt__review" onClick={refresh}>{copy.retry}</button>
      )}
    </section>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadHeaderRow({
    id: "project-trust",
    order: 40,
    component: ({ threadId, environment }) => environment ? <TrustCard key={threadId} threadId={threadId} /> : null,
  });
});
