import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  createSubmissionId,
  isSubmissionInFlight,
  isSubmissionTerminal,
  submissionStatusText,
  submissionStatusTone,
  type SubmissionPhase
} from "./submission-status";
import { LEGACY_UNBATCHED_NOTICE, answersByQuestion } from "./batch-comparison";

type Stage = "overview" | "settings" | "materials" | "personas" | "questions" | "preflight" | "queue" | "results";

type ProviderId = "gemini" | "openai";

type CredentialPresence = {
  available: boolean;
  source: "keychain" | "env" | null;
  fingerprint: string | null;
  verifiedByUse?: boolean;
};

type ProviderMetadata = Record<
  ProviderId,
  { label: string; models: readonly string[]; defaultModel: string; endpointClass: string }
>;

type JobSummary = {
  jobId: string;
  projectDirectory: string;
  runId: string;
  status: "queued" | "running" | "partial" | "completed" | "cancelled" | "failed";
  mode: "mocked" | "live";
  provider: ProviderId;
  model: string;
  error: string | null;
  attempt: number;
  submissionId?: string | null;
};

type SubmissionEnqueueResponse = {
  ok: boolean;
  found?: boolean;
  submissionId: string;
  submissionStatus: Exclude<SubmissionPhase, "idle" | "submitting"> | null;
  duplicate: boolean;
  queuedCount: number;
  jobs: JobSummary[];
  snapshot: Record<string, unknown> | null;
  error: string | null;
};

type LibraryEntry = {
  personaVersion: {
    id: string;
    personaId: string;
    label: string;
    rawInput?: string;
    confirmedAt?: string;
    realPersonApplies?: boolean;
    contentHash: string;
  };
  savedAt: string;
  origin: { projectId: string; projectDirectory: string | null } | null;
};

type WorkbookIssue = { code: string; path: string; message: string };

type WorkbookCheck =
  | {
      path: string;
      ok: true;
      workbook: {
        formatId: string;
        sources: Array<{ title: string; enabled: boolean; sourceId: string }>;
        questionSets: Array<{ questionSetId: string; items: unknown[] }>;
        personas: Array<{ label: string; enabled: boolean; personaId: string }>;
        batches: Array<{
          batchId: string;
          sourceId: string;
          questionSetId: string;
          sampleCount: number;
          rows: Array<{ enabled: boolean; personaId: string }>;
        }>;
      };
      warnings: WorkbookIssue[];
    }
  | { path: string; ok: false; errors: WorkbookIssue[]; warnings: WorkbookIssue[] };

const STAGES: Array<{ id: Stage; label: string }> = [
  { id: "overview", label: "總覽" },
  { id: "settings", label: "設定" },
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
  const [recoverableNotice, setRecoverableNotice] = useState<string | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [provider, setProvider] = useState<ProviderId>("gemini");
  const [model, setModel] = useState<string>("");
  const [customModel, setCustomModel] = useState(false);
  const [providerMetadata, setProviderMetadata] = useState<ProviderMetadata | null>(null);
  const [credentialState, setCredentialState] = useState<Record<ProviderId, CredentialPresence>>({
    gemini: { available: false, source: null, fingerprint: null, verifiedByUse: false },
    openai: { available: false, source: null, fingerprint: null, verifiedByUse: false }
  });
  const [saveReceipt, setSaveReceipt] = useState<{ provider: ProviderId; fingerprint: string } | null>(null);
  // API keys must never enter React state, because state may be retained by
  // devtools/error reporting. The DOM password input is read exactly once
  // for the credential IPC call and cleared immediately afterwards.
  const apiKeyInputs = useRef<Partial<Record<ProviderId, HTMLInputElement | null>>>({});
  const [library, setLibrary] = useState<{ settings: { autoSave: boolean }; personas: LibraryEntry[] } | null>(null);
  const [questionLibrary, setQuestionLibrary] = useState<{
    entries: Array<{ id: string; name: string; questions: string[] }>;
  } | null>(null);
  const [questionLibraryQuery, setQuestionLibraryQuery] = useState("");
  const [questionLibraryName, setQuestionLibraryName] = useState("");
  const [editingQuestionLibraryId, setEditingQuestionLibraryId] = useState<string | null>(null);
  const [selectedPersonaVersionIds, setSelectedPersonaVersionIds] = useState<string[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [workbookCheck, setWorkbookCheck] = useState<WorkbookCheck | null>(null);
  const [submitPhase, setSubmitPhase] = useState<SubmissionPhase>("idle");
  const activeSubmissionId = useRef<string | null>(null);
  const submitInFlight = useRef(false);

  const api = window.opinionSimulator;
  const providerModels = providerMetadata?.[provider].models ?? [];
  const defaultModel = (id: ProviderId) => providerMetadata?.[id].defaultModel ?? "";
  const providerLabel = (id: ProviderId) => providerMetadata?.[id].label ?? id;

  const filledQuestions = useMemo(() => questions.map((q) => q.trim()).filter(Boolean), [questions]);
  const ready = useMemo(
    () => Boolean(directory && sourceText.trim() && personaRaw.trim() && filledQuestions.length > 0),
    [directory, sourceText, personaRaw, filledQuestions]
  );

  async function invoke<T>(channel: string, payload?: unknown): Promise<T | null> {
    try {
      return (await api.invoke(channel, payload)) as T;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  async function refreshCredential() {
    const creds = await invoke<{
      providers: Record<ProviderId, CredentialPresence>;
    }>("credential.status");
    if (creds?.providers) {
      setCredentialState({
        gemini: {
          available: creds.providers.gemini.available,
          source: creds.providers.gemini.source,
          fingerprint: creds.providers.gemini.fingerprint ?? null,
          verifiedByUse: Boolean(creds.providers.gemini.verifiedByUse)
        },
        openai: {
          available: creds.providers.openai.available,
          source: creds.providers.openai.source,
          fingerprint: creds.providers.openai.fingerprint ?? null,
          verifiedByUse: Boolean(creds.providers.openai.verifiedByUse)
        }
      });
    }
  }

  async function refreshProviderMetadata() {
    const catalog = await invoke<ProviderMetadata>("provider.catalog");
    if (catalog) {
      setProviderMetadata(catalog);
      setModel((current) => current || catalog.gemini.defaultModel);
    }
  }

  async function refreshJobs(projectDirectory = directory) {
    const listed = await invoke<{ jobs: JobSummary[] }>("queue.list", {
      projectDirectory: projectDirectory || undefined
    });
    if (listed?.jobs) {
      setJobs(
        projectDirectory ? listed.jobs.filter((job) => job.runId) : listed.jobs
      );
    }
  }

  async function openProjectAt(path: string, projectTitle = title): Promise<boolean> {
    const created = await invoke<{
      openedExisting: boolean;
      title: string;
      sourceText: string;
      personaRaw: string;
      personaLabel: string;
      questions: string[];
      provider?: ProviderId;
      model?: string;
      disclaimerAcknowledged?: boolean;
    }>("project.create", { projectDirectory: path, title: projectTitle });
    if (created === null) {
      setDirectory("");
      setDisclaimer(false);
      setPreflight(null);
      return false;
    }
    setDirectory(path);
    setDisclaimer(Boolean(created.disclaimerAcknowledged));
    setPreflight(null);
    setRecoverableNotice(null);
    if (created.openedExisting) {
      setTitle(created.title || projectTitle);
      setSourceText(created.sourceText);
      setPersonaRaw(created.personaRaw);
      setPersonaLabel(created.personaLabel);
      setQuestions(created.questions.length > 0 ? created.questions : [""]);
      if (created.provider === "gemini" || created.provider === "openai") {
        pickProvider(created.provider);
        if (created.model) {
          const listed = providerMetadata?.[created.provider].models ?? [];
          if (listed.includes(created.model)) {
            setCustomModel(false);
            setModel(created.model);
          } else {
            setCustomModel(true);
            setModel(created.model);
          }
        }
      }
    }
    await refreshJobs(path);
    const snap = await invoke<Record<string, unknown>>("project.open", { projectDirectory: path });
    if (snap) {
      setSnapshot(snap);
    }
    return true;
  }

  useEffect(() => {
    void refreshProviderMetadata();
    void refreshCredential();
    void refreshLibrary();
    void refreshQuestionLibrary();
    void (async () => {
      const result = await invoke<{ jobs: JobSummary[]; snapshot: Record<string, unknown> | null }>(
        "queue.resumeMissing",
        {}
      );
      if (result?.jobs) {
        setJobs(result.jobs);
      }
      if (result?.snapshot) {
        setSnapshot(result.snapshot);
      }

      // Check last-project memory safely
      const last = await invoke<{
        remembered: { projectDirectory: string; workbookPath?: string } | null;
        status: "none" | "valid" | "missing" | "invalid";
        message: string | null;
      }>("project.getLastProject");
      if (last?.status === "valid" && last.remembered?.projectDirectory) {
        const ok = await openProjectAt(last.remembered.projectDirectory);
        if (ok) {
          setStatus("已自動復原上次開啟的專案資料夾。");
          if (last.remembered.workbookPath) {
            const check = await invoke<WorkbookCheck>("workbook.validate", {
              path: last.remembered.workbookPath
            });
            if (check) {
              setWorkbookCheck(check);
            }
          }
        }
      } else if (last?.status === "missing" || last?.status === "invalid") {
        setRecoverableNotice(
          last.message || "上次使用的專案目錄已不存在或無效。現有檔案安全未受影響，請選擇其他資料夾。"
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshLibrary() {
    const lib = await invoke<{ settings: { autoSave: boolean }; personas: LibraryEntry[] }>(
      "persona.library.list"
    );
    if (lib) {
      setLibrary(lib);
    }
  }

  async function refreshQuestionLibrary(query = questionLibraryQuery) {
    const listed = await invoke<{
      entries: Array<{ id: string; name: string; questions: string[] }>;
    }>("question.library.list", { query });
    if (listed?.entries) {
      setQuestionLibrary(listed);
    }
  }

  async function saveCurrentQuestionsToLibrary() {
    setStatus("");
    const result = await invoke<{ entry: { name: string } }>("question.library.save", {
      id: editingQuestionLibraryId ?? undefined,
      name: questionLibraryName,
      questions
    });
    if (!result) {
      return;
    }
    setEditingQuestionLibraryId(null);
    setQuestionLibraryName("");
    await refreshQuestionLibrary();
    setStatus(`問題庫已保存「${result.entry.name}」。`);
  }

  async function applyQuestionLibrary(id: string, mode: "append" | "replace") {
    if (!directory) {
      setStatus("【專案】請先選擇或開啟專案資料夾。");
      return;
    }
    setStatus("");
    const next = await invoke<{ questions: string[] }>("question.library.apply", {
      projectDirectory: directory,
      id,
      mode
    });
    if (!next) {
      return;
    }
    setQuestions(next.questions.length > 0 ? next.questions : [""]);
    setPreflight(null);
    setStatus(mode === "append" ? "已追加問題庫題目到目前草稿。" : "已用問題庫題目取代目前草稿。");
  }

  async function removeQuestionLibrary(id: string, name: string) {
    setStatus("");
    if ((await invoke<unknown>("question.library.remove", { id })) === null) {
      return;
    }
    if (editingQuestionLibraryId === id) {
      setEditingQuestionLibraryId(null);
      setQuestionLibraryName("");
    }
    await refreshQuestionLibrary();
    setStatus(`已從問題庫移除「${name}」。`);
  }

  async function useLibraryPersona(entry: LibraryEntry) {
    setPersonaLabel(entry.personaVersion.label);
    setPersonaRaw(String(entry.personaVersion.rawInput ?? ""));
    setStatus(
      `已載入「${entry.personaVersion.label}」到表單；請按「確認 Persona Version」建立新版本。`
    );
  }

  async function applyLibrarySelection() {
    if (!directory) {
      setStatus("【Persona】請先選擇或開啟專案資料夾。");
      return;
    }
    const selected = await invoke<{
      personaLabel: string;
      personaRaw: string;
      personas: unknown[];
    }>("project.selectPersonas", {
      projectDirectory: directory,
      personaVersionIds: selectedPersonaVersionIds
    });
    if (!selected) return;
    setPersonaLabel(selected.personaLabel);
    setPersonaRaw(selected.personaRaw);
    setPreflight(null);
    setStatus(`已選用 ${selected.personas.length} 個已確認的 Persona Version；請重新產生 Preflight。`);
  }

  async function removeLibraryPersona(entry: LibraryEntry) {
    setStatus("");
    if (
      (await invoke<unknown>("persona.library.remove", {
        personaVersionId: entry.personaVersion.id
      })) === null
    ) {
      return;
    }
    await refreshLibrary();
    setStatus(`已從 Persona library 移除「${entry.personaVersion.label}」。`);
  }

  async function toggleAutosave() {
    if (!library) {
      return;
    }
    if ((await invoke<unknown>("persona.library.setAutosave", { enabled: !library.settings.autoSave })) === null) {
      return;
    }
    await refreshLibrary();
  }

  async function importFromProject() {
    setStatus("");
    const path = await invoke<string>("desktop.chooseDirectory");
    if (!path) {
      return;
    }
    const result = await invoke<{ saved: boolean; librarySize: number }>(
      "persona.library.importFromProject",
      { projectDirectory: path }
    );
    if (!result) {
      return;
    }
    await refreshLibrary();
    setStatus(result.saved ? "已從專案匯入 Persona Version。" : "此專案的 Persona 已在 library 中。");
  }

  async function saveApiKey(target: ProviderId) {
    const input = apiKeyInputs.current[target];
    const value = input?.value ?? "";
    if (!value.trim()) {
      setStatus(`【設定】請先貼上 ${providerLabel(target)} 的 API key，再按儲存。`);
      return;
    }
    setStatus("");
    // 中性欄位名 value：IPC 防線會拒絕 credential 形狀的欄位名，回應只含狀態、不含 key 本體。
    const next = await invoke<{
      providers: Record<ProviderId, CredentialPresence>;
    }>("credential.set", { provider: target, value });
    if (input) {
      input.value = "";
    }
    if (!next) {
      return;
    }
    await refreshCredential();
    const fingerprint = next.providers[target]?.fingerprint;
    if (next.providers[target]?.available && fingerprint) {
      setSaveReceipt({ provider: target, fingerprint });
      setStatus(
        `已安全儲存 ${providerLabel(target)} 金鑰（識別碼 ${fingerprint}）。這只確認本機憑證儲存區寫入成功，不代表 ${providerLabel(target)} 已接受這組金鑰。`
      );
    } else {
      setSaveReceipt(null);
      setStatus(
        `【設定】${providerLabel(target)} 寫入後讀回未看到可用金鑰。請再儲存一次，或改以主程序環境變數啟動。`
      );
    }
  }

  async function clearApiKey(target: ProviderId) {
    setStatus("");
    if ((await invoke<unknown>("credential.clear", { provider: target })) === null) {
      return;
    }
    await refreshCredential();
    if (saveReceipt?.provider === target) {
      setSaveReceipt(null);
    }
    setStatus(`已從系統憑證儲存區移除 ${providerLabel(target)} API key。`);
  }

  function pickProvider(next: ProviderId) {
    setProvider(next);
    if (!customModel) {
      setModel(defaultModel(next));
    }
  }

  async function persistDraft(): Promise<boolean> {
    return (
      (await invoke<unknown>("project.saveDraft", {
        projectDirectory: directory,
        title,
        sourceText,
        personaRaw,
        personaLabel,
        questions: filledQuestions,
        provider,
        model
      })) !== null
    );
  }

  async function chooseWorkbook() {
    setStatus("");
    const path = await invoke<string>("desktop.chooseWorkbook");
    if (!path) {
      return;
    }
    const result = await invoke<WorkbookCheck>("workbook.validate", { path });
    if (!result) {
      return;
    }
    setWorkbookCheck(result);
    setStatus(
      result.ok
        ? "Workbook 檢查通過。可點擊「匯入為專案草稿」建立批次執行計畫。"
        : `【Workbook】檢查未通過：${result.errors.length} 項錯誤。請依下方代碼與欄位位置修正 Excel 後再選一次。`
    );
  }

  async function importWorkbook() {
    if (!directory) {
      setStatus("【Workbook 匯入】請先選擇或開啟專案資料夾。");
      return;
    }
    if (!workbookCheck || !workbookCheck.ok) {
      setStatus("【Workbook 匯入】請先選擇通過檢查的 Workbook 檔案。");
      return;
    }
    setStatus("");
    const res = await invoke<{
      ok: true;
      batchId: string;
      sourceTitle: string;
      sourceText: string;
      questions: string[];
      personaCount: number;
      questionCount: number;
      sampleCount: number;
      personaLabel: string;
      personaRaw: string;
    }>("workbook.importDraft", {
      projectDirectory: directory,
      path: workbookCheck.path
    });
    if (!res) return;

    setTitle(res.sourceTitle || title);
    setSourceText(res.sourceText);
    setQuestions(res.questions.length > 0 ? res.questions : [""]);
    setPersonaRaw(res.personaRaw);
    setPersonaLabel(res.personaLabel);
    setPreflight(null);
    setStatus(
      `已匯入批次 ${res.batchId}：包含 ${res.personaCount} 位 Persona、${res.questionCount} 題問題（樣本數 ${res.sampleCount}）。請先在 Persona 頁明確確認這批 Persona，之後才會建立 Preflight。`
    );
    setStage("personas");
  }

  async function chooseAndExtractMaterial() {
    setStatus("");
    const filePath = await invoke<string>("desktop.chooseMaterialFile");
    if (!filePath) return;
    const res = await invoke<{
      text: string;
      fileName: string;
      format: string;
      characterCount: number;
    }>("material.extractFile", { path: filePath });
    if (res?.text) {
      setSourceText(res.text);
      setStatus(`已從 ${res.fileName} 抽取 ${res.characterCount} 字並填入材料（格式：${res.format.toUpperCase()}）。`);
    }
  }

  async function chooseDir() {
    setStatus("");
    const path = await invoke<string>("desktop.chooseDirectory");
    if (!path) {
      return;
    }
    const ok = await openProjectAt(path);
    if (ok) {
      setStatus("已開啟專案。新的 Run 會附加到這個資料夾，不會刪除既有內容。");
    }
  }

  async function confirmPersona() {
    if (!personaRaw.trim()) {
      setStatus("【Persona】請先輸入 Persona 背景，再到本頁按「確認 Persona Version」。");
      return;
    }
    setStatus("");
    if (!(await persistDraft())) {
      return;
    }
    if ((await invoke<unknown>("project.confirmPersona", { projectDirectory: directory })) === null) {
      return;
    }
    setPreflight(null);
    await refreshLibrary();
    setStatus(
      library?.settings.autoSave
        ? "Persona Version 已確認，並已存入 Persona library。"
        : "Persona Version 已確認。"
    );
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
    activeSubmissionId.current = null;
    submitInFlight.current = false;
    setSubmitPhase("idle");
    setPreflight(view);
    if (typeof view.disclaimerAcknowledged === "boolean") {
      setDisclaimer(view.disclaimerAcknowledged);
    }
    setStage("preflight");
  }

  async function setDisclaimerChecked(acknowledged: boolean) {
    if (!directory) {
      setStatus("【專案】請先選擇或開啟專案資料夾。");
      return;
    }
    const next = await invoke<{ disclaimerAcknowledged: boolean }>("preflight.setDisclaimer", {
      projectDirectory: directory,
      acknowledged
    });
    if (next) {
      setDisclaimer(next.disclaimerAcknowledged);
    }
  }

  function applySubmissionResult(next: SubmissionEnqueueResponse, mode: "mocked" | "live") {
    const phase: SubmissionPhase = next.submissionStatus ?? (next.ok ? "accepted" : "submit_failed");
    setSubmitPhase(phase);
    submitInFlight.current = isSubmissionInFlight(phase);
    if (phase !== "submit_failed" && isSubmissionTerminal(phase)) {
      activeSubmissionId.current = null;
    }
    if (next.jobs) {
      setJobs(next.jobs);
    }
    const batches = next.snapshot?.executionBatches as Array<{ executionBatchId?: string }> | undefined;
    const latestBatchId = batches?.[batches.length - 1]?.executionBatchId;
    if (typeof latestBatchId === "string") {
      setSelectedBatchId(latestBatchId);
    }
    const label = submissionStatusText(phase, next.error);
    if (phase === "completed" && next.snapshot) {
      setSnapshot(next.snapshot);
      setPreflight(null);
      setStage("results");
      setStatus(
        mode === "mocked"
          ? `${label}${next.queuedCount > 1 ? `（共 ${next.queuedCount} 個 Persona Job）` : ""}`
          : `${label}${next.queuedCount > 1 ? `（共 ${next.queuedCount} 個 Persona Job）` : ""}`
      );
      return;
    }
    if (phase === "accepted" || phase === "running") {
      setStage("queue");
    }
    if (phase === "submit_failed") {
      setStatus(label);
      return;
    }
    setStatus(label);
  }

  async function run(mode: "mocked" | "live") {
    if (submitInFlight.current || isSubmissionInFlight(submitPhase)) {
      return;
    }
    if (!disclaimer) {
      setStatus("【Preflight】尚未承認預測聲明。請到「Preflight」頁勾選「我承認這是 AI 模擬，不是真實引言」。");
      return;
    }
    setStatus("");
    if (!(await persistDraft())) {
      return;
    }
    if (!preflight) {
      setStage("preflight");
      setStatus("【Preflight】尚未產生並檢視計畫。請先在 Preflight 頁產生目前計畫預覽。");
      return;
    }

    const isBatch = Boolean(preflight.isBatch);
    const planHash = isBatch ? preflight.batchPlanHash : preflight.planHash;
    if (typeof planHash !== "string") {
      setStatus(
        isBatch
          ? "【Preflight】無法取得批次計畫雜湊。請到「Preflight」頁重新產生預覽。"
          : "【Preflight】無法取得目前計畫。請到「Preflight」頁重新產生預覽。"
      );
      return;
    }

    if (!activeSubmissionId.current) {
      activeSubmissionId.current = createSubmissionId();
    }
    const submissionId = activeSubmissionId.current;
    submitInFlight.current = true;
    setSubmitPhase("submitting");
    setStatus("送出中");

    const payload = isBatch
      ? {
          projectDirectory: directory,
          batchPlanHash: planHash,
          acknowledgedDisclaimer: true,
          mode,
          submissionId
        }
      : {
          projectDirectory: directory,
          planHash,
          acknowledgedDisclaimer: true,
          mode,
          submissionId
        };
    const channel = isBatch ? "queue.enqueueBatch" : "queue.enqueue";
    let next = await invoke<SubmissionEnqueueResponse>(channel, payload);
    if (!next) {
      const recovered = await invoke<SubmissionEnqueueResponse>("queue.submissionStatus", {
        submissionId,
        projectDirectory: directory
      });
      if (recovered?.found) {
        next = recovered;
      } else {
        setSubmitPhase("submit_failed");
        submitInFlight.current = false;
        setStatus("送出失敗。接受狀態不明，已查詢既有送出，沒有建立新批次。");
        await refreshJobs();
        return;
      }
    }
    if (mode === "live" && next.snapshot) {
      await refreshCredential();
    }
    applySubmissionResult(next, mode);
  }


  async function cancelQueued(jobId: string) {
    setStatus("");
    if ((await invoke<unknown>("queue.cancel", { jobId })) === null) {
      return;
    }
    await refreshJobs();
    setStatus("已取消 Job。");
  }

  async function retryQueued(jobId: string) {
    setStatus("");
    const next = await invoke<{ jobs: JobSummary[]; snapshot: Record<string, unknown> | null }>(
      "queue.retry",
      { jobId }
    );
    if (!next) {
      await refreshJobs();
      return;
    }
    setJobs(next.jobs);
    if (next.snapshot) {
      setSnapshot(next.snapshot);
      setStage("results");
      setStatus("重試完成。");
    }
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
            {recoverableNotice ? (
              <div className="alert-warning">
                <div>
                  <strong>專案復原提醒：</strong> {recoverableNotice}
                </div>
                <button onClick={() => void chooseDir()}>選擇其他專案資料夾</button>
              </div>
            ) : null}
            <label>
              專案標題
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <p>專案資料夾：{directory || "尚未選擇"}</p>
            <p className="muted">可選空資料夾建立新專案，或選已有的專案資料夾以附加新的 Run；現有檔案不會被刪除或覆寫。</p>
            <button className="primary" onClick={() => void chooseDir()}>
              選擇專案資料夾
            </button>
          </section>
        )}
        {stage === "overview" && (
          <section className="card">
            <h1>Workbook 檢查與匯入</h1>
            <p>
              選擇固定格式的 Excel（.xlsx）。系統會嚴格檢查 5 個工作表、欄位名稱與驗證規則，並提供一鍵批次匯入（最多支援 30 位 Persona）。
            </p>
            <p>檔案：{workbookCheck?.path || "尚未選擇"}</p>
            <div className="actions">
              <button className="primary" onClick={() => void chooseWorkbook()}>
                選擇 Workbook
              </button>
              {workbookCheck?.ok && directory ? (
                <button onClick={() => void importWorkbook()}>
                  匯入為專案草稿 (1–30 位 Persona)
                </button>
              ) : null}
            </div>
            {workbookCheck ? <WorkbookCheckReport result={workbookCheck} /> : null}
          </section>
        )}
        {stage === "overview" && (
          <section className="card">
            <h2>模型憑證狀態</h2>
            {(["gemini", "openai"] as ProviderId[]).map((target) => {
              const cred = credentialState[target];
              return (
                <p key={target}>
                  <strong>{providerLabel(target)}</strong>：
                  {cred.available ? (
                    <>
                      {cred.source === "keychain" ? "已安全儲存於系統憑證儲存區" : "使用環境變數"}
                      {cred.fingerprint ? `（識別碼 ${cred.fingerprint}）` : ""}
                      {cred.verifiedByUse ? (
                        <span className="badge badge-verified">已透過即時呼叫驗證</span>
                      ) : (
                        <span className="badge badge-unverified">尚未經即時呼叫驗證</span>
                      )}
                    </>
                  ) : (
                    "未設定"
                  )}
                </p>
              );
            })}
            <button onClick={() => setStage("settings")}>前往「設定」管理金鑰</button>
          </section>
        )}
        {stage === "settings" && (
          <section className="card">
            <h1>設定</h1>
            <p className="muted">
              統一管理模型服務商憑證。金鑰只會存入系統憑證儲存區（macOS Keychain / Windows Credential Manager），由主程序直接取用；前端介面與專案檔案皆不會留存或回顯金鑰。
            </p>
            {(["gemini", "openai"] as ProviderId[]).map((target) => {
              const cred = credentialState[target];
              const statusText = !cred.available
                ? "尚未儲存"
                : cred.source === "keychain"
                  ? "已安全儲存於系統憑證儲存區"
                  : "使用環境變數（建議改存鑰匙圈）";
              const receipt = saveReceipt?.provider === target ? saveReceipt : null;
              return (
                <div key={target} className="credential-row">
                  <p>
                    <strong>{providerLabel(target)}</strong>：{statusText}
                    {cred.verifiedByUse ? (
                      <span className="badge badge-verified">已透過即時呼叫驗證</span>
                    ) : (
                      <span className="badge badge-unverified">尚未經即時呼叫驗證</span>
                    )}
                  </p>
                  {cred.fingerprint ? (
                    <p className="muted">
                      識別碼 {cred.fingerprint}（用來確認目前存的是哪一組金鑰，不是金鑰本身，也無法還原金鑰）
                    </p>
                  ) : (
                    <p className="muted">尚未偵測到已儲存的金鑰。貼上後按儲存，成功會顯示「已安全儲存」與識別碼。</p>
                  )}
                  {receipt ? (
                    <p className="save-receipt">
                      已安全儲存（識別碼 {receipt.fingerprint}）。這只確認本機寫入成功，不代表 {providerLabel(target)} 已接受這組金鑰。成功完成第一次 Live Run 後將標示為「已驗證」。
                    </p>
                  ) : null}
                  <label>
                    {providerLabel(target)} API key（貼上後按儲存；輸入內容不會被保留在畫面上）
                    <input
                      type="password"
                      ref={(node) => {
                        apiKeyInputs.current[target] = node;
                      }}
                      placeholder="貼上 API key"
                      autoComplete="off"
                    />
                  </label>
                  <div className="actions">
                    <button className="primary" onClick={() => void saveApiKey(target)}>
                      儲存到系統憑證儲存區
                    </button>
                    <button onClick={() => void clearApiKey(target)}>從系統憑證儲存區移除</button>
                  </div>
                </div>
              );
            })}
          </section>
        )}
        {stage === "materials" && (
          <section className="card">
            <h1>材料</h1>
            <p>貼上要模擬對象閱讀的原始材料（Source），或直接從本機檔案載入。</p>
            <div className="actions">
              <button onClick={() => void chooseAndExtractMaterial()}>
                從檔案載入 (TXT / Markdown / DOCX / PDF)
              </button>
            </div>
            <label>
              Source 材料
              <textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} rows={10} />
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
        {stage === "personas" && (
          <section className="card">
            <h1>Persona library</h1>
            <p>已確認的 Persona Version 會自動存入這裡，之後可以直接選用，不必重打。</p>
            <label className="disclaimer-check">
              <input
                type="checkbox"
                checked={library?.settings.autoSave ?? true}
                onChange={() => void toggleAutosave()}
              />
              確認時自動存入 library
            </label>
            <div className="actions">
              <button onClick={() => void importFromProject()}>從專案匯入</button>
              <button
                className="primary"
                disabled={selectedPersonaVersionIds.length < 1 || selectedPersonaVersionIds.length > 30}
                onClick={() => void applyLibrarySelection()}
              >
                選用已勾選 Persona（{selectedPersonaVersionIds.length}）
              </button>
            </div>
            {library?.personas.length ? (
              <ul className="plain-list library-list">
                {library.personas.map((entry) => (
                  <li key={entry.personaVersion.id} className="library-item">
                    <div>
                      <label>
                        <input
                          type="checkbox"
                          checked={selectedPersonaVersionIds.includes(entry.personaVersion.id)}
                          onChange={(event) =>
                            setSelectedPersonaVersionIds((current) =>
                              event.target.checked
                                ? [...current, entry.personaVersion.id]
                                : current.filter((id) => id !== entry.personaVersion.id)
                            )
                          }
                        />
                        加入批次
                      </label>
                      <strong>{entry.personaVersion.label || "（未命名）"}</strong>
                      <p className="muted">
                        {entry.personaVersion.confirmedAt
                          ? String(entry.personaVersion.confirmedAt).replace("T", " ").replace("Z", " UTC")
                          : entry.savedAt}
                        {entry.personaVersion.realPersonApplies ? " · 涉及真實人物" : ""}
                      </p>
                    </div>
                    <div className="actions">
                      <button className="primary" onClick={() => void useLibraryPersona(entry)}>
                        選用
                      </button>
                      <button onClick={() => void removeLibraryPersona(entry)}>移除</button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">目前還沒有已儲存的 Persona。</p>
            )}
          </section>
        )}
        {stage === "questions" && (
          <>
          <section className="card">
            <h1>問題</h1>
            <p>可以逐題記錄想詢問的問題，每一題都會放進 Question Set。載入問題庫是副本，之後改庫不會改到已完成的 Run。</p>
            {questions.map((question, index) => (
              <label key={index}>
                問題 {index + 1}
                <input
                  value={question}
                  onChange={(event) =>
                    setQuestions(questions.map((item, i) => (i === index ? event.target.value : item)))
                  }
                />
                <div className="actions">
                  {index > 0 ? (
                    <button
                      onClick={() =>
                        setQuestions((current) => {
                          const next = [...current];
                          [next[index - 1], next[index]] = [next[index], next[index - 1]];
                          return next;
                        })
                      }
                    >
                      上移
                    </button>
                  ) : null}
                  {index < questions.length - 1 ? (
                    <button
                      onClick={() =>
                        setQuestions((current) => {
                          const next = [...current];
                          [next[index], next[index + 1]] = [next[index + 1], next[index]];
                          return next;
                        })
                      }
                    >
                      下移
                    </button>
                  ) : null}
                  {questions.length > 1 ? (
                    <button onClick={() => setQuestions(questions.filter((_, i) => i !== index))}>移除</button>
                  ) : null}
                </div>
              </label>
            ))}
            <button onClick={() => setQuestions([...questions, ""])}>新增問題</button>
          </section>
          <section className="card">
            <h1>問題庫</h1>
            <p>保存單題或整組問題，重開 App 後仍可搜尋載入。載入時請選擇追加或取代。</p>
            <label>
              問題集名稱
              <input
                value={questionLibraryName}
                onChange={(event) => setQuestionLibraryName(event.target.value)}
                placeholder="例如：試辦評估"
              />
            </label>
            <div className="actions">
              <button className="primary" onClick={() => void saveCurrentQuestionsToLibrary()}>
                {editingQuestionLibraryId ? "更新問題庫項目" : "保存目前問題到問題庫"}
              </button>
              {editingQuestionLibraryId ? (
                <button
                  onClick={() => {
                    setEditingQuestionLibraryId(null);
                    setQuestionLibraryName("");
                  }}
                >
                  取消編輯
                </button>
              ) : null}
            </div>
            <label>
              搜尋
              <input
                value={questionLibraryQuery}
                onChange={(event) => {
                  const query = event.target.value;
                  setQuestionLibraryQuery(query);
                  void refreshQuestionLibrary(query);
                }}
                placeholder="名稱或題目文字"
              />
            </label>
            {questionLibrary?.entries.length ? (
              <ul className="plain-list library-list">
                {questionLibrary.entries.map((entry) => (
                  <li key={entry.id} className="library-item">
                    <div>
                      <strong>{entry.name}</strong>
                      <p className="muted">{entry.questions.length} 題 · {entry.questions[0]}</p>
                    </div>
                    <div className="actions">
                      <button className="primary" onClick={() => void applyQuestionLibrary(entry.id, "append")}>
                        追加
                      </button>
                      <button onClick={() => void applyQuestionLibrary(entry.id, "replace")}>取代</button>
                      <button
                        onClick={() => {
                          setEditingQuestionLibraryId(entry.id);
                          setQuestionLibraryName(entry.name);
                          setQuestions(entry.questions.length > 0 ? entry.questions : [""]);
                          setPreflight(null);
                          setStatus(`已載入「${entry.name}」到表單，可修改後按更新。`);
                        }}
                      >
                        編輯
                      </button>
                      <button onClick={() => void removeQuestionLibrary(entry.id, entry.name)}>移除</button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">目前還沒有已保存的問題集。</p>
            )}
          </section>
          </>
        )}
        {stage === "preflight" && (
          <section className="card">
            <h1>Preflight</h1>
            <p>
              送出前逐項確認：外傳材料、Persona、問題、模型與目的地。預測聲明在本專案工作階段只需勾選一次；更換計畫後要重新產生預覽，切換專案或重啟後要重新勾選聲明。
            </p>
            <button className="primary" onClick={() => void renderPreflight()}>
              產生目前計畫預覽
            </button>
            {preflight ? <PreflightReport data={preflight} /> : null}
            <label className="disclaimer-check">
              <input
                type="checkbox"
                checked={disclaimer}
                onChange={(event) => void setDisclaimerChecked(event.target.checked)}
              />
              我承認這是 AI 模擬的預測，不是真實引言
            </label>
          </section>
        )}
        {stage === "queue" && (
          <section className="card">
            <h1>執行</h1>
            <p>{ready ? "必要輸入已齊備。" : "還缺少專案資料夾、材料、Persona 背景或至少一題問題。"}</p>
            <label>
              供應商
              <select value={provider} onChange={(event) => pickProvider(event.target.value as ProviderId)}>
                {(["gemini", "openai"] as ProviderId[]).map((id) => (
                  <option key={id} value={id}>
                    {providerLabel(id)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              型號
              <select
                value={customModel ? "__custom__" : model}
                onChange={(event) => {
                  if (event.target.value === "__custom__") {
                    setCustomModel(true);
                  } else {
                    setCustomModel(false);
                    setModel(event.target.value);
                  }
                }}
              >
                {providerModels.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
                <option value="__custom__">自訂…</option>
              </select>
            </label>
            {customModel ? (
              <label>
                自訂型號名稱
                <input value={model} onChange={(event) => setModel(event.target.value)} />
              </label>
            ) : null}
            <button
              className="primary"
              disabled={!ready || !providerMetadata || isSubmissionInFlight(submitPhase)}
              onClick={() => void run("mocked")}
            >
              模擬 Run（不呼叫模型）
            </button>
            <p>
              {credentialState[provider].available
                ? `已偵測到 ${providerLabel(provider)} 憑證（來源：${credentialState[provider].source === "keychain" ? "系統憑證儲存區" : "環境變數"}${credentialState[provider].fingerprint ? `，識別碼 ${credentialState[provider].fingerprint}` : ""}）。${credentialState[provider].verifiedByUse ? "這組憑證已成功完成過 Live 請求。" : "尚未由成功的 Live 請求驗證。"}`
                : `未偵測到 ${providerLabel(provider)} 憑證。請在下方「設定」貼上 API key 並按儲存，確認出現「已安全儲存」。`}
            </p>
            <button
              disabled={
                !ready ||
                !providerMetadata ||
                !credentialState[provider].available ||
                isSubmissionInFlight(submitPhase)
              }
              onClick={() => void run("live")}
            >
              Live {providerLabel(provider)} Run（{model || defaultModel(provider)}）
            </button>
            <p
              className={`submit-status submit-status-${submissionStatusTone(submitPhase)}`}
              role="status"
              aria-live="polite"
            >
              {submitPhase === "idle" ? "" : submissionStatusText(submitPhase)}
            </p>
            {jobs.filter((job) => !directory || job.projectDirectory === directory).length > 0 ? (
              <>
                <h2>Queue</h2>
                <p className="muted">重啟後只會續跑尚未寫入專案的 Job；已完成的 Run 不會重跑。</p>
                <ul className="plain-list library-list">
                  {jobs
                    .filter((job) => !directory || job.projectDirectory === directory)
                    .map((job) => (
                    <li key={job.jobId} className="library-item">
                      <div>
                        <strong>
                          {job.mode === "mocked" ? "模擬" : "Live"} · {job.runId}
                        </strong>
                        <p className="muted">
                          {job.status}
                          {job.attempt > 1 ? ` · 第 ${job.attempt} 次` : ""}
                          {job.error ? ` · ${job.error}` : ""}
                        </p>
                      </div>
                      <div className="actions">
                        {job.status === "queued" || job.status === "running" || job.status === "partial" || job.status === "failed" ? (
                          <button onClick={() => void cancelQueued(job.jobId)}>取消</button>
                        ) : null}
                        {job.status === "failed" || job.status === "partial" || job.status === "cancelled" ? (
                          <button className="primary" onClick={() => void retryQueued(job.jobId)}>
                            重試
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        )}
        {stage === "results" && (
          <section className="card">
            <h1>結果</h1>
            <BatchResultsPanel
              snapshot={snapshot}
              jobs={jobs.filter((job) => !directory || job.projectDirectory === directory)}
              selectedBatchId={selectedBatchId}
              onSelectBatch={setSelectedBatchId}
            />
          </section>
        )}
        {status ? <p className={statusBannerClass(status)}>{status}</p> : null}
      </main>
    </div>
  );
}

type SnapshotRunView = {
  runId: string;
  personaLabel: string;
  result: { directReaction?: string; personaRecommendations?: unknown; systemSuggestions?: unknown } | null;
  answers?: Array<{ question: string; answer: string }>;
  rawResponse: unknown;
  stabilityComparison?: unknown;
  reportMarkdown?: string | null;
  samples?: Array<{ sampleId: string; result: unknown }>;
  provider?: string | null;
  model?: string | null;
};

type ExecutionBatchView = {
  executionBatchId: string;
  sourceText: string;
  questions: string[];
  questionTitle?: string;
  provider: string | null;
  model: string | null;
  runIds: string[];
  runs: SnapshotRunView[];
};

function BatchResultsPanel({
  snapshot,
  jobs,
  selectedBatchId,
  onSelectBatch
}: {
  snapshot: Record<string, unknown> | null;
  jobs: JobSummary[];
  selectedBatchId: string | null;
  onSelectBatch: (id: string) => void;
}) {
  const batches = (snapshot?.executionBatches as ExecutionBatchView[] | undefined) ?? [];
  const unbatched = (snapshot?.unbatchedRuns as SnapshotRunView[] | undefined) ?? [];
  const hasLegacyOnly =
    batches.length === 0 &&
    ((snapshot?.runs as SnapshotRunView[] | undefined)?.length ?? 0) > 0 &&
    unbatched.length === 0;
  const legacyRuns = hasLegacyOnly ? ((snapshot?.runs as SnapshotRunView[]) ?? []) : unbatched;
  const activeBatch =
    batches.find((batch) => batch.executionBatchId === selectedBatchId) ?? batches[batches.length - 1] ?? null;

  if (!snapshot || (batches.length === 0 && legacyRuns.length === 0 && !snapshot.result)) {
    return <p>尚未產生結果。請先在「執行」頁完成一次 Run。</p>;
  }

  return (
    <>
      {batches.length > 1 ? (
        <div className="batch-switcher">
          <h2>送出批次</h2>
          <p className="muted">每一次送出是獨立批次；相同材料再送出不會與上一批合併。</p>
          <div className="actions">
            {batches.map((batch, index) => (
              <button
                key={batch.executionBatchId}
                className={activeBatch?.executionBatchId === batch.executionBatchId ? "primary" : ""}
                onClick={() => onSelectBatch(batch.executionBatchId)}
              >
                第 {index + 1} 批 · {batch.runs.length} 位 Persona
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {activeBatch ? (
        <SamePageBatch
          batch={activeBatch}
          jobs={jobs.filter((job) => job.submissionId === activeBatch.executionBatchId)}
        />
      ) : null}
      {legacyRuns.length > 0 ? (
        <section className="legacy-unbatched">
          <h2>{LEGACY_UNBATCHED_NOTICE}</h2>
          <p className="muted">這些結果寫入時尚未記錄送出批次，不會依材料或時間猜測分組。</p>
          <SamePageBatch
            batch={{
              executionBatchId: "legacy-unbatched",
              sourceText: String(snapshot.sourceText ?? ""),
              questions: Array.isArray(snapshot.questions) ? (snapshot.questions as string[]) : [],
              provider: typeof snapshot.provider === "string" ? snapshot.provider : null,
              model: typeof snapshot.model === "string" ? snapshot.model : null,
              runIds: legacyRuns.map((run) => run.runId),
              runs: legacyRuns
            }}
            jobs={[]}
            legacy
          />
        </section>
      ) : null}
    </>
  );
}

function SamePageBatch({
  batch,
  jobs,
  legacy = false
}: {
  batch: ExecutionBatchView;
  jobs: JobSummary[];
  legacy?: boolean;
}) {
  const questionRows = answersByQuestion(batch.questions, batch.runs);
  const pendingJobs = jobs.filter((job) => job.status !== "completed");
  return (
    <div className="batch-page">
      {!legacy ? (
        <>
          <h2>本批摘要</h2>
          <p className="muted">
            {batch.runs.length} 位 Persona · {batch.provider ?? "未知供應商"} · {batch.model ?? "未知型號"}
          </p>
          <h3>共享材料</h3>
          <pre>{batch.sourceText}</pre>
          <h3>{batch.questionTitle || "問題"}</h3>
          <ol>
            {batch.questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ol>
        </>
      ) : null}
      {pendingJobs.length > 0 ? (
        <ul className="plain-list">
          {pendingJobs.map((job) => (
            <li key={job.jobId}>
              {job.runId}：{job.status}
              {job.error ? ` · ${job.error}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      <h2>Direct Reaction</h2>
      <div className="reaction-grid">
        {batch.runs.map((run) => (
          <article key={run.runId} className="reaction-card">
            <h3>{run.personaLabel}</h3>
            <p>{String(run.result?.directReaction ?? "")}</p>
          </article>
        ))}
      </div>
      {questionRows.length > 0 ? (
        <>
          <h2>依問題比較</h2>
          {questionRows.map((row) => (
            <div key={row.question} className="question-compare">
              <h3>{row.question}</h3>
              <div className="reaction-grid">
                {row.answers.map((item) => (
                  <article key={item.runId} className="reaction-card">
                    <h4>{item.personaLabel}</h4>
                    <p>{item.answer}</p>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </>
      ) : null}
      {batch.runs.map((run) => {
        return (
          <details key={`details-${run.runId}`}>
            <summary>
              {run.personaLabel} 的建議、多樣本、原始回應與報告
            </summary>
            {run.stabilityComparison ? (
              <div className="stability-card">
                <h3>多樣本穩定度比較</h3>
                <pre>{JSON.stringify(run.stabilityComparison, null, 2)}</pre>
              </div>
            ) : null}
            <h3>Persona Recommendations</h3>
            <pre>{JSON.stringify(run.result?.personaRecommendations, null, 2)}</pre>
            <h3>System Suggestions</h3>
            <pre>{JSON.stringify(run.result?.systemSuggestions, null, 2)}</pre>
            <h3>原始回應</h3>
            <pre>{JSON.stringify(run.rawResponse, null, 2)}</pre>
            {run.reportMarkdown ? (
              <>
                <h3>報告（Markdown）</h3>
                <pre>{run.reportMarkdown}</pre>
              </>
            ) : null}
          </details>
        );
      })}
    </div>
  );
}

function statusBannerClass(status: string): string {
  if (status.startsWith("【")) {
    return "status-banner status-error";
  }
  if (
    status.includes("已安全儲存") ||
    status.includes("完成") ||
    status.includes("已開啟") ||
    status.includes("已載入") ||
    status.includes("已確認") ||
    status.includes("檢查通過") ||
    status.includes("已從")
  ) {
    return "status-banner status-ok";
  }
  return "status-banner";
}

function WorkbookIssues({ title, issues }: { title: string; issues: WorkbookIssue[] }) {
  if (issues.length === 0) {
    return null;
  }
  return (
    <>
      <h2>{title}</h2>
      <ul className="plain-list workbook-issues">
        {issues.map((issue, index) => (
          <li key={`${issue.code}-${issue.path}-${index}`}>
            <code>{issue.code}</code> · {issue.path} · {issue.message}
          </li>
        ))}
      </ul>
    </>
  );
}

function WorkbookCheckReport({ result }: { result: WorkbookCheck }) {
  if (!result.ok) {
    return (
      <div className="workbook-report">
        <WorkbookIssues title="錯誤" issues={result.errors} />
        <WorkbookIssues title="警告" issues={result.warnings} />
      </div>
    );
  }

  const enabledPersonas = result.workbook.personas.filter((persona) => persona.enabled).length;
  const enabledBatchRows = result.workbook.batches.reduce(
    (count, batch) => count + batch.rows.filter((row) => row.enabled).length,
    0
  );

  return (
    <div className="workbook-report">
      <p>
        格式 {result.workbook.formatId}：{result.workbook.personas.length} 位 Persona（啟用 {enabledPersonas}），
        {result.workbook.batches.length} 個批次（啟用列 {enabledBatchRows}）。
      </p>
      <h2>Persona</h2>
      <ul className="plain-list">
        {result.workbook.personas.map((persona) => (
          <li key={persona.personaId}>
            {persona.label}（{persona.personaId}）· {persona.enabled ? "啟用" : "未啟用"}
          </li>
        ))}
      </ul>
      <h2>材料</h2>
      <ul className="plain-list">
        {result.workbook.sources.map((source) => (
          <li key={source.sourceId}>
            {source.title}（{source.sourceId}）· {source.enabled ? "啟用" : "未啟用"}
          </li>
        ))}
      </ul>
      <h2>問題集</h2>
      <ul className="plain-list">
        {result.workbook.questionSets.map((set) => (
          <li key={set.questionSetId}>
            {set.questionSetId} · {set.items.length} 題
          </li>
        ))}
      </ul>
      <h2>執行清單</h2>
      <ul className="plain-list">
        {result.workbook.batches.map((batch) => (
          <li key={batch.batchId}>
            {batch.batchId} · 樣本數 {batch.sampleCount} · {batch.rows.length} 列
          </li>
        ))}
      </ul>
      <WorkbookIssues title="警告" issues={result.warnings} />
      <p className="muted">檢查通過不代表已匯入專案或已核准執行。</p>
    </div>
  );
}

function parseMaybeJson(text: unknown): unknown | null {
  if (typeof text !== "string") {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return (
    <div className="kv">
      <span className="kv-label">{label}</span>
      <span className="kv-value">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="preflight-section">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export function PreflightReport({ data }: { data: Record<string, unknown> }) {
  if (data.isBatch) {
    const matrix = data.matrix as {
      personaCount: number;
      questionCount: number;
      sampleCount: number;
      totalRequests: number;
    };
    const estimate = data.estimate as {
      approximateInputTokensPerRequest: number;
      approximateTotalInputTokens: number;
    };
    const personas =
      (data.personas as Array<{ personaId: string; label: string; planHash: string; runId: string }>) ?? [];
    const destination = data.destination as { provider: string; model: string } | undefined;
    const warnings = (data.warnings as string[] | undefined) ?? [];

    return (
      <div className="preflight-report">
        <div className="batch-summary">
          <h2>批次預覽總覽 (Batch: {String(data.batchId)})</h2>
          <div className="preflight-meta">
            <Row
              label="批次規模"
              value={`共 ${matrix.personaCount} 位 Persona · ${matrix.questionCount} 題問題 · 樣本數 ${matrix.sampleCount}`}
            />
            <Row label="總規劃請求數" value={`${matrix.totalRequests} 次請求`} />
            <Row
              label="規模估算"
              value={`約 ${estimate.approximateInputTokensPerRequest} tokens／請求，總計約 ${estimate.approximateTotalInputTokens} tokens（字數推估，非計費依據）`}
            />
            <Row label="目的地" value={destination ? `${destination.provider} · ${destination.model}` : ""} />
            <Row label="批次計畫雜湊" value={String(data.batchPlanHash ?? "").slice(0, 16) + "..."} />
          </div>
        </div>

        {warnings.length > 0 ? (
          <Section title="注意事項">
            <ul className="plain-list">
              {warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Section title={`包含 Persona 清單 (${personas.length} 位)`}>
          <div className="batch-grid">
            {personas.map((p) => (
              <div key={p.personaId} className="batch-card">
                <strong>{p.label}</strong>
                <p className="muted">ID: {p.personaId}</p>
                <p className="muted">Run: {p.runId}</p>
                <p className="muted">Hash: {p.planHash.slice(0, 8)}...</p>
              </div>
            ))}
          </div>
        </Section>

        <details className="advanced">
          <summary>進階：完整原始批次預覽（JSON）</summary>
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </details>

        <div className="disclaimer-banner">{String(data.predictionDisclaimer ?? "")}</div>
      </div>
    );
  }

  const outbound = data.outbound as Record<string, any> | undefined;
  const destination = data.destination as Record<string, any> | undefined;
  const estimate = data.estimate as Record<string, any> | undefined;
  const persona = outbound?.personaVersion as Record<string, any> | undefined;
  const sections = (outbound?.promptSections ?? {}) as Record<string, string>;
  const source = outbound?.source as Record<string, any> | undefined;
  const warnings = (data.warnings as string[] | undefined) ?? [];
  const fields = (persona?.fields ?? {}) as Record<string, string>;

  const fieldLabels: Record<string, string> = {
    roleAndContext: "角色與情境",
    goalsAndInterests: "目標與關注",
    concerns: "顧慮",
    constraintsAndResources: "限制與資源",
    knowledgeAndExperience: "知識與經驗",
    valuesAndDecisionStyle: "價值與決策風格",
    responseStyle: "回應風格",
    notes: "備註"
  };

  const sampling = parseMaybeJson(sections.modelAndSampling) as Record<string, any> | null;
  const outputSchemaText = sections.outputSchema;

  return (
    <div className="preflight-report">
      <div className="preflight-meta">
        <Row label="執行編號" value={String(data.runId ?? "")} />
        <Row label="目的地" value={destination ? `${destination.provider} · ${destination.model}` : ""} />
        <Row label="樣本數" value={String(data.sampleCount ?? "")} />
        <Row
          label="規模估算"
          value={
            estimate
              ? `約 ${estimate.inputCharactersPerRequest} 字／請求，約 ${estimate.approximateInputTokensPerRequest} tokens × ${estimate.requestCount} 個請求（字數推估，非計費資料）`
              : ""
          }
        />
        <Row label="計畫產生時間" value={String(data.createdAt ?? "").replace("T", " ").replace("Z", " UTC")} />
      </div>

      {warnings.length > 0 ? (
        <Section title="注意事項">
          <ul className="plain-list">
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="外傳材料（Source）">
        {source ? (
          <>
            <p className="muted">檔名：{source.filename}</p>
            <blockquote className="source-quote">{String(source.text)}</blockquote>
          </>
        ) : null}
      </Section>

      <Section title="Persona 版本">
        {persona ? (
          <>
            <Row label="顯示名稱" value={String(persona.label ?? "")} />
            {Object.entries(fields).map(([key, value]) => (
              <Row key={key} label={fieldLabels[key] ?? key} value={value} />
            ))}
            {(persona.notProvidedFields as string[] | undefined)?.length ? (
              <p className="muted">
                未提供（保持空白，不會由 AI 補足）：
                {(persona.notProvidedFields as string[])
                  .map((key) => fieldLabels[key] ?? key)
                  .join("、")}
              </p>
            ) : null}
            {persona.rawInput ? (
              <details className="advanced">
                <summary>原始輸入原文</summary>
                <blockquote className="source-quote">{String(persona.rawInput)}</blockquote>
              </details>
            ) : null}
          </>
        ) : null}
      </Section>

      <Section title="要詢問的問題">
        <pre className="prompt-plain">{sections.questions ?? ""}</pre>
      </Section>

      <Section title="給模型的系統指令">
        <pre className="prompt-plain">{sections.systemAndTaskRules ?? ""}</pre>
      </Section>

      <details className="advanced">
        <summary>進階：模型取樣參數</summary>
        {sampling ? (
          <div className="preflight-meta">
            <Row label="provider" value={String(sampling.provider ?? "")} />
            <Row label="model" value={String(sampling.model ?? "")} />
            <Row label="sampleCount" value={String(sampling.sampleCount ?? "")} />
            <Row
              label="settings"
              value={JSON.stringify(sampling.settings ?? {}, null, 0)}
            />
            <Row
              label="truncation"
              value={`${sampling.truncation?.strategy ?? ""}${sampling.truncation?.applied ? "（已套用）" : "（未套用）"}`}
            />
          </div>
        ) : (
          <pre className="prompt-plain">{sections.modelAndSampling ?? ""}</pre>
        )}
      </details>

      <details className="advanced">
        <summary>進階：要求的輸出格式（JSON schema 說明）</summary>
        <pre className="prompt-plain">{outputSchemaText ?? ""}</pre>
      </details>

      <details className="advanced">
        <summary>進階：完整原始預覽（JSON）</summary>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </details>

      <div className="disclaimer-banner">{String(data.predictionDisclaimer ?? "")}</div>
    </div>
  );
}
