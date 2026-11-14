type LocalMessage = { role: "system" | "user" | "assistant"; content: string }
type ChatTurn = { role: string; content: string }
type GenerationOutput = { generated_text: string | ChatTurn[] }
type TextGenerator = (messages: LocalMessage[], options: Record<string, unknown>) => Promise<GenerationOutput[]>
type PipelineFactory = (task: string, model: string, options: Record<string, unknown>) => Promise<TextGenerator>

const DEFAULT_MODEL = "onnx-community/Qwen2.5-0.5B-Instruct"
let generatorPromise: Promise<TextGenerator> | null = null
let loadedModelId = ''
let activeProgress: ((message: string) => void) | undefined

function progressLabel(event: Record<string, unknown>): string {
  const status = String(event.status || "loading")
  const file = typeof event.file === "string" ? event.file.split("/").pop() : ""
  const progress = typeof event.progress === "number" ? Math.round(event.progress) : null
  return [status, file, progress === null ? "" : `${progress}%`].filter(Boolean).join(" · ")
}

async function createGenerator(modelId: string, useWebGpu: boolean): Promise<TextGenerator> {
  const transformers = await import("@huggingface/transformers")
  const pipeline = transformers.pipeline as unknown as PipelineFactory
  const options: Record<string, unknown> = {
    dtype: "q4",
    progress_callback: (event: Record<string, unknown>) => activeProgress?.(progressLabel(event)),
  }
  if (useWebGpu) options.device = "webgpu"
  return pipeline("text-generation", modelId, options)
}

/**
 * Runs inference entirely in the browser. Model files are downloaded from
 * Hugging Face on first use and cached by Transformers.js in browser storage.
 */
export async function requestLocalReply(
  messages: LocalMessage[],
  modelId = DEFAULT_MODEL,
  onProgress?: (message: string) => void,
): Promise<string> {
  if (!modelId.trim()) throw new Error("أدخل معرّف النموذج المحلي.")
  activeProgress = onProgress
  const useWebGpu = typeof navigator !== "undefined" && "gpu" in navigator
  if (!generatorPromise || loadedModelId !== modelId) {
    loadedModelId = modelId
    generatorPromise = createGenerator(modelId, useWebGpu).catch(async (error) => {
      if (!useWebGpu) throw error
      activeProgress?.("تعذر تشغيل WebGPU؛ تجري محاولة استخدام المعالج (WASM).")
      return createGenerator(modelId, false)
    })
  }
  try {
    const generator = await generatorPromise
    activeProgress?.("النموذج جاهز؛ جارٍ توليد الرد محلياً.")
    const compactHistory = messages.slice(-8)
    const output = await generator(compactHistory, {
      max_new_tokens: 192,
      do_sample: false,
      repetition_penalty: 1.08,
    })
    const generated = output?.[0]?.generated_text
    const last = Array.isArray(generated) ? generated[generated.length - 1] : generated
    const text = typeof last === "string" ? last : last?.content
    if (!text || typeof text !== "string") throw new Error("لم يُرجع النموذج المحلي نصاً.")
    return text.trim()
  } catch (error) {
    generatorPromise = null
    loadedModelId = ''
    const message = error instanceof Error ? error.message : String(error)
    throw new Error("تعذر تشغيل النموذج المحلي: " + message)
  } finally {
    activeProgress = undefined
  }
}

export function getDefaultLocalModel(): string {
  return DEFAULT_MODEL
}
