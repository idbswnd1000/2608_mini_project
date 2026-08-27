def deterministic_response_options(model: str) -> dict[str, float]:
    if model.startswith("gpt-5"):
        return {}
    return {"temperature": 0}
