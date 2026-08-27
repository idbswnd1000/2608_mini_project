const answerKeys = ["answer", "response", "content", "message"];

export function cleanCustomerAnswer(value: unknown) {
  let text = typeof value === "string" ? value : "";
  text = text.trim();
  if (!text) return text;

  text = stripCodeFence(text);
  text = extractJsonAnswer(text);
  text = stripTemplateWrapper(text);
  text = removeInternalHeadingLines(text);
  text = replaceTemplatePlaceholders(text);
  text = replaceInternalTerms(text);
  return normalizeSpacing(text);
}

function stripCodeFence(text: string) {
  const match = text.match(/^```(?:json|text|markdown)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : text;
}

function extractJsonAnswer(text: string) {
  if (!text.startsWith("{") || !text.endsWith("}")) return text;

  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    for (const key of answerKeys) {
      const candidate = payload[key];
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  } catch {
    const match = text.match(/^\{\s*['"]?(?:answer|response|content|message)['"]?\s*:\s*['"]?([\s\S]*?)['"]?\s*\}$/i);
    if (match) return match[1].trim();
  }

  return text;
}

function stripTemplateWrapper(text: string) {
  const trimmed = text.trim();
  const wrappers: Array<[string, string]> = [
    ["{{{", "}}}"],
    ["{{", "}}"],
  ];

  for (const [opener, closer] of wrappers) {
    if (trimmed.startsWith(opener) && trimmed.endsWith(closer)) {
      return trimmed.slice(opener.length, -closer.length).trim();
    }
  }

  return trimmed;
}

function removeInternalHeadingLines(text: string) {
  const headingPattern =
    /^\s*(?:[-*]\s*)?(?:#+\s*)?(?:context|컨텍스트|검색된\s*문서|제공된\s*context|retrieval|chunk|embedding|vector|rerank|top-k|llm|rag)(?:에서\s*확인되는\s*내용|에\s*없는\s*내용|로\s*확인한\s*내용|상\s*확인되는\s*내용)?\s*[:：]?\s*$/i;

  return text
    .split(/\r?\n/)
    .filter((line) => !headingPattern.test(line))
    .join("\n")
    .trim();
}

function replaceTemplatePlaceholders(text: string) {
  return text.replace(/\{\{\{?\s*[^{}\n]{1,80}\s*\}?\}\}/g, "해당 정보");
}

function replaceInternalTerms(text: string) {
  return text
    .replace(/제공된\s*context/gi, "제공된 정보")
    .replace(/검색된\s*Context/gi, "확인된 정보")
    .replace(/Context/gi, "확인된 정보")
    .replace(/검색된\s*문서/g, "확인된 안내")
    .replace(/문서에\s*명시되어\s*있지\s*않습니다/g, "현재 확인 가능한 안내만으로는 확인하기 어렵습니다")
    .replace(/LLM\s*답변\s*생성에\s*실패했습니다\./gi, "답변을 생성하지 못했습니다.");
}

function normalizeSpacing(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/[ \t]+/g, " ").trim());
  const compactLines: string[] = [];
  let previousBlank = false;

  for (const line of lines) {
    const blank = line.length === 0;
    if (blank && previousBlank) continue;
    compactLines.push(line);
    previousBlank = blank;
  }

  return compactLines.join("\n").trim();
}

export function answerFontSizeHint(text: string) {
  const length = cleanCustomerAnswer(text).length;
  if (length < 260) return 25;
  if (length < 420) return 23;
  if (length < 620) return 21;
  if (length < 850) return 19;
  return 18;
}
