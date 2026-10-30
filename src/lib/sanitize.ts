import sanitizeHtml from "sanitize-html";

/**
 * Document content is stored as HTML produced by the TipTap editor. Because
 * shared documents render one user's content in another user's browser, every
 * write is sanitized against the same small set of tags the editor can produce.
 */
const ALLOWED_TAGS = [
  "p", "br", "h1", "h2", "h3",
  "strong", "b", "em", "i", "u", "s",
  "ul", "ol", "li", "blockquote",
  "code", "pre", "hr", "a",
];

export function sanitizeContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ["href", "target", "rel"], ol: ["start"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }),
    },
  });
}
