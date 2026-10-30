import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { fileToHtml, textToHtml, titleFromFilename } from "@/lib/import";

describe("file import", () => {
  it("turns plain text paragraphs into HTML and escapes markup", async () => {
    expect(textToHtml("Hello <b>world</b>\nline two\n\nSecond para")).toBe(
      "<p>Hello &lt;b&gt;world&lt;/b&gt;<br>line two</p><p>Second para</p>",
    );
  });

  it("converts markdown headings, emphasis and lists", async () => {
    const html = await fileToHtml("notes.md", Buffer.from("# Title\n\n**bold** and *it*\n\n- a\n- b\n"));
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>it</em>");
    expect(html).toContain("<ul><li>a</li><li>b</li></ul>");
    // No whitespace between blocks, so the editor doesn't create empty paragraphs.
    expect(html).not.toMatch(/>\s+</);
  });

  it("sanitizes raw HTML embedded in markdown", async () => {
    const html = await fileToHtml("x.md", Buffer.from("hi <img src=x onerror=alert(1)><script>bad()</script>"));
    expect(html).not.toMatch(/img|onerror|script/);
  });

  it("rejects unsupported and empty files with clear errors", async () => {
    await expect(fileToHtml("photo.png", Buffer.from("x"))).rejects.toMatchObject({ status: 415 });
    await expect(fileToHtml("empty.txt", Buffer.alloc(0))).rejects.toBeInstanceOf(AppError);
    await expect(fileToHtml("broken.docx", Buffer.from("not a zip"))).rejects.toMatchObject({ status: 400 });
  });

  it("derives a readable title from the file name", () => {
    expect(titleFromFilename("Q3_launch_plan.docx")).toBe("Q3 launch plan");
    expect(titleFromFilename(".md")).toBe("Imported document");
  });
});
