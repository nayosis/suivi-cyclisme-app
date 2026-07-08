def format_number(value: float, decimals: int = 0) -> str:
    text = f"{value:,.{decimals}f}"
    text = text.replace(",", " ").replace(".", ",")
    return text
