/**
 * Rendu Markdown minimal (sans dépendance) pour les commentaires de
 * maintenance : titres, gras, italique, code, listes et paragraphes. Le
 * texte est échappé avant tout traitement pour éviter toute injection HTML.
 */
export function renderMarkdown(text: string): string {
  if (!text.trim()) return "";

  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  function renderInline(line: string): string {
    return line
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  }

  const blocks = escaped.split(/\n{2,}/);
  const html = blocks
    .map((block) => {
      const lines = block.split("\n").filter((l) => l.trim() !== "");
      if (lines.length === 0) return "";

      const heading = lines[0].match(/^(#{1,3})\s+(.*)$/);
      if (lines.length === 1 && heading) {
        const level = heading[1].length;
        return `<h${level}>${renderInline(heading[2])}</h${level}>`;
      }

      if (lines.every((l) => /^[-*]\s+/.test(l))) {
        const items = lines.map((l) => `<li>${renderInline(l.replace(/^[-*]\s+/, ""))}</li>`).join("");
        return `<ul>${items}</ul>`;
      }

      if (lines.every((l) => /^\d+\.\s+/.test(l))) {
        const items = lines.map((l) => `<li>${renderInline(l.replace(/^\d+\.\s+/, ""))}</li>`).join("");
        return `<ol>${items}</ol>`;
      }

      return `<p>${lines.map(renderInline).join("<br />")}</p>`;
    })
    .filter(Boolean)
    .join("\n");

  return html;
}
