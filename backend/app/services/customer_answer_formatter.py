import json
import re


ANSWER_KEYS = ("answer", "response", "content", "message")


def clean_customer_answer(text: str) -> str:
    answer = str(text or "").strip()
    if not answer:
        return answer

    answer = _strip_code_fence(answer)
    answer = _extract_json_answer(answer)
    answer = _strip_template_wrapper(answer)
    answer = _remove_internal_heading_lines(answer)
    answer = _replace_template_placeholders(answer)
    answer = _replace_internal_terms(answer)
    return _normalize_spacing(answer)


def _strip_code_fence(text: str) -> str:
    stripped = text.strip()
    match = re.fullmatch(r"```(?:json|text|markdown)?\s*(.*?)\s*```", stripped, flags=re.DOTALL | re.IGNORECASE)
    return match.group(1).strip() if match else stripped


def _extract_json_answer(text: str) -> str:
    stripped = text.strip()
    if not (stripped.startswith("{") and stripped.endswith("}")):
        return stripped

    try:
        payload = json.loads(stripped)
    except json.JSONDecodeError:
        match = re.fullmatch(
            r"\{\s*['\"]?(?:answer|response|content|message)['\"]?\s*:\s*['\"]?(.*?)['\"]?\s*\}",
            stripped,
            flags=re.DOTALL | re.IGNORECASE,
        )
        return match.group(1).strip() if match else stripped

    if isinstance(payload, dict):
        for key in ANSWER_KEYS:
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return stripped


def _strip_template_wrapper(text: str) -> str:
    stripped = text.strip()
    for opener, closer in (("{{{", "}}}"), ("{{", "}}")):
        if stripped.startswith(opener) and stripped.endswith(closer):
            return stripped[len(opener) : -len(closer)].strip()
    return stripped


def _remove_internal_heading_lines(text: str) -> str:
    internal_heading = re.compile(
        r"^\s*(?:[-*]\s*)?(?:#+\s*)?"
        r"(?:context|컨텍스트|검색된\s*문서|제공된\s*context|retrieval|chunk|embedding|vector|rerank|top-k|llm|rag)"
        r"(?:에서\s*확인되는\s*내용|에\s*없는\s*내용|로\s*확인한\s*내용|상\s*확인되는\s*내용)?\s*[:：]?\s*$",
        flags=re.IGNORECASE,
    )
    lines = [line for line in text.splitlines() if not internal_heading.match(line)]
    return "\n".join(lines).strip()


def _replace_template_placeholders(text: str) -> str:
    return re.sub(r"\{\{\{?\s*[^{}\n]{1,80}\s*\}?\}\}", "해당 정보", text)


def _replace_internal_terms(text: str) -> str:
    replacements = [
        (r"제공된\s*context", "제공된 정보"),
        (r"검색된\s*Context", "확인된 정보"),
        (r"Context", "확인된 정보"),
        (r"context", "확인된 정보"),
        (r"검색된\s*문서", "확인된 안내"),
        (r"문서에\s*명시되어\s*있지\s*않습니다", "현재 확인 가능한 안내만으로는 확인하기 어렵습니다"),
        (r"LLM\s*답변\s*생성에\s*실패했습니다\.", "답변을 생성하지 못했습니다."),
    ]
    result = text
    for pattern, replacement in replacements:
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
    return result


def _normalize_spacing(text: str) -> str:
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines()]
    compact_lines: list[str] = []
    previous_blank = False
    for line in lines:
        blank = not line
        if blank and previous_blank:
            continue
        compact_lines.append(line)
        previous_blank = blank
    return "\n".join(compact_lines).strip()
