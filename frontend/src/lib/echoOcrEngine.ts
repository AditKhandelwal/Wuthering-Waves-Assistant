import type { OcrLine } from "./echoOcrParse";

// The only file that touches tesseract.js. `import()` is used instead of a
// top-level import so Vite code-splits the engine + its multi-MB wasm/model
// payload into a separate chunk that's fetched only when a user actually
// runs an import -- never as part of the main bundle. Worker/core/language
// files come from tesseract.js's default CDN (jsDelivr), cached by the
// browser after first use -- free and zero extra setup, at the cost of
// needing network access the first time OCR runs in a given browser (see
// .claude/rules/frontend.md).
export async function recognizeEchoCardImage(
  image: File | Blob,
  onProgress?: (percent: number) => void,
): Promise<OcrLine[]> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", undefined, {
    logger: (m) => {
      if (onProgress && m.status === "recognizing text") {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  try {
    const { data } = await worker.recognize(image, {}, { blocks: true });
    const lines: OcrLine[] = [];
    for (const block of data.blocks ?? []) {
      for (const paragraph of block.paragraphs) {
        for (const line of paragraph.lines) {
          const text = line.text.trim();
          if (text) lines.push({ text, confidence: line.confidence, bbox: line.bbox });
        }
      }
    }
    return lines;
  } finally {
    await worker.terminate();
  }
}
