import { useMemo, useState } from "react";

type Stage = "overview" | "materials" | "personas" | "questions" | "preflight" | "queue" | "results";

const STAGES: Array<{ id: Stage; label: string }> = [
  { id: "overview", label: "總覽" },
  { id: "materials", label: "材料" },
  { id: "personas", label: "Persona" },
  { id: "questions", label: "問題" },
  { id: "preflight", label: "Preflight" },
  { id: "queue", label: "執行" },
  { id: "results", label: "結果" }
];

export function App() {
  const [stage, setStage] = useState<Stage>("overview");
  const [title, setTitle] = useState("桌面模擬");
  const [directory, setDirectory] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [personaRaw, setPersonaRaw] = useState("");
  const [personaLabel, setPersonaLabel] = useState("");
  const [questions, setQuestions] = useState<string[]>([""]);
  const [disclaimer, setDisclaimer] = useState(false);
  const [preflight, setPreflight] = useState<Record<string, unknown> | null>(null);
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState("");
  const [geminiAvailable, setGeminiAvailable] = useState(false);

  const api = window.opinionSimulator;

  const filledQuestions = useMemo(() => questions.map((q) => q.trim()).filter(Boolean), [questions]);
  const ready = useMemo(
    () => Boolean(directory && sourceText.trim() && personaRaw.trim() && filledQuestions.length > 0),
    [directory, sourceText, personaRaw, filledQuestions]
  );

  async function invoke<T>(channel: string, payload?: unknown): Promise<T | null> {
    try {
      return (await api.invoke(channel, payload)) as T;
    } catch (error) {
      setStatus(`發生錯誤：${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  async function chooseDir() {
    setStatus("");
    const path = await invoke<string>("desktop.chooseDirectory");
    if (!path) {
      return;
    }
    setDirectory(path);
    const created = await invoke<unknown>("project.create", { projectDirectory: path, title });
    if (created === null) {
      setDirectory("");
      return;
    }
    const creds = await invoke<{ geminiAvailable: boolean }>("credential.status");
    setGeminiAvailable(Boolean(creds?.geminiAvailable));
  }

  async function persistDraft(): Promise<boolean> {
    return (
      (await invoke<unknown>("project.saveDraft", {
        projectDirectory: directory,
        title,
        sourceText,
        personaRaw,
        personaLabel,
        questions: filledQuestions
      })) !== null
    );
  }

  async function confirmPersona() {
    if (!personaRaw.trim()) {
      setStatus("請先輸入 Persona 背景。");
      return;
    }
    setStatus("");
    if (!(await persistDraft())) {
      return;
    }
    if ((await invoke<unknown>("project.confirmPersona", { projectDirectory: directory })) === null) {
      return;
    }
    setStatus("Persona Version 已確認。");
  }

  async function renderPreflight() {
    setStatus("");
    if (!(await persistDraft())) {
      return;
    }
    const view = await invoke<Record<string, unknown>>("preflight.render", { projectDirectory: directory });
    if (!view) {
      return;
    }
    setPreflight(view);
    setStage("preflight");
  }

  async function run(channel: "run.mocked" | "run.liveGemini") {
    if (!disclaimer) {
      setStatus("請先在 Preflight 頁勾選「我承認這是 AI 模擬，不是真實引言」。");
      return;
    }
    setStatus("");
    const next = await invoke<Record<string, unknown>>(channel, {
      projectDirectory: directory,
      acknowledgedDisclaimer: true
    });
    if (!next) {
      return;
    }
    setSnapshot(next);
    setStage("results");
    setStatus("Run 完成。");
  }

  return (
    <div className="app">
      <nav>
        <p>意見模擬器 v0.1</p>
        {STAGES.map((item) => (
          <button key={item.id} className={stage === item.id ? "active" : ""} onClick={() => setStage(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>
      <main>
        <div className="banner">AI 模擬內容 — 並非真實引言。以下輸出是依 Persona 與材料產生的預測。</div>
        {stage === "overview" && (
          <section className="card">
            <h1>總覽</h1>
            <p>各階段可自由切換。資料只會在 Preflight 頁承認預測聲明並開始執行後，才會送往模型。</p>
            <label>
              專案標題
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <p>專案資料夾：{directory || "尚未選擇"}</p>
            <button className="primary" onClick={() => void chooseDir()}>
              選擇專案資料夾
            </button>
          </section>
        )}
        {stage === "materials" && (
          <section className="card">
            <h1>材料</h1>
            <p>貼上要模擬對象閱讀的原始材料（Source）。</p>
            <label>
              Source 材料
              <textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} />
            </label>
          </section>
        )}
        {stage === "personas" && (
          <section className="card">
            <h1>Persona</h1>
            <p>用一段自由的文字描述受模擬角色的身分、處境與關注即可；系統會直接以這段背景作為角色設定，並完整保留原文供日後稽核，不需要你重複填寫其他欄位。</p>
            <label>
              顯示名稱
              <input value={personaLabel} onChange={(event) => setPersonaLabel(event.target.value)} />
            </label>
            <label>
              Persona 背景
              <textarea value={personaRaw} onChange={(event) => setPersonaRaw(event.target.value)} />
            </label>
            <button className="primary" onClick={() => void confirmPersona()}>
              確認 Persona Version
            </button>
            <p>確認後如需修改背景，會建立新的 Persona Version，不會覆寫已確認的版本。</p>
          </section>
        )}
        {stage === "questions" && (
          <section className="card">
            <h1>問題</h1>
            <p>可以逐題記錄想詢問的問題，每一題都會放進 Question Set。</p>
            {questions.map((question, index) => (
              <label key={index}>
                問題 {index + 1}
                <input
                  value={question}
                  onChange={(event) =>
                    setQuestions(questions.map((item, i) => (i === index ? event.target.value : item)))
                  }
                />
                {questions.length > 1 ? (
                  <button onClick={() => setQuestions(questions.filter((_, i) => i !== index))}>移除</button>
                ) : null}
              </label>
            ))}
            <button onClick={() => setQuestions([...questions, ""])}>新增問題</button>
          </section>
        )}
        {stage === "preflight" && (
          <section className="card">
            <h1>Preflight</h1>
            <p>送出前檢視目前計畫：外傳材料、Persona、問題、模型與目的地。</p>
            <button className="primary" onClick={() => void renderPreflight()}>
              產生目前計畫預覽
            </button>
            {preflight ? <pre>{JSON.stringify(preflight, null, 2)}</pre> : null}
            <label>
              <input type="checkbox" checked={disclaimer} onChange={(event) => setDisclaimer(event.target.checked)} />
              我承認這是 AI 模擬的預測，不是真實引言
            </label>
          </section>
        )}
        {stage === "queue" && (
          <section className="card">
            <h1>執行</h1>
            <p>{ready ? "必要輸入已齊備。" : "還缺少專案資料夾、材料、Persona 背景或至少一題問題。"}</p>
            <button className="primary" disabled={!ready} onClick={() => void run("run.mocked")}>
              模擬 Run（不呼叫 Gemini）
            </button>
            <p>{geminiAvailable ? "已偵測到主程序的 Gemini 憑證，可進行 Live Run。" : "未偵測到 Gemini 憑證。請以 GEMINI_API_KEY 環境變數啟動本程式後再使用 Live Run。"}</p>
            <button disabled={!ready || !geminiAvailable} onClick={() => void run("run.liveGemini")}>
              Live Gemini Run
            </button>
          </section>
        )}
        {stage === "results" && (
          <section className="card">
            <h1>結果</h1>
            {snapshot?.result ? (
              <>
                <h2>Direct Reaction</h2>
                <p>{String((snapshot.result as { directReaction?: string }).directReaction ?? "")}</p>
                <h2>Persona Recommendations</h2>
                <pre>{JSON.stringify((snapshot.result as { personaRecommendations?: string[] }).personaRecommendations, null, 2)}</pre>
                <h2>System Suggestions</h2>
                <pre>{JSON.stringify((snapshot.result as { systemSuggestions?: string[] }).systemSuggestions, null, 2)}</pre>
                <h2>原始回應</h2>
                <pre>{JSON.stringify(snapshot.rawResponse, null, 2)}</pre>
                <h2>報告（Markdown）</h2>
                <pre>{String(snapshot.reportMarkdown ?? "")}</pre>
              </>
            ) : (
              <p>尚未產生結果。請先在「執行」頁完成一次 Run。</p>
            )}
          </section>
        )}
        <p>{status}</p>
      </main>
    </div>
  );
}
