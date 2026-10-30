"use client";

import { useRef } from "react";
import { useEditorState, type Editor } from "@tiptap/react";

type Props = {
  editor: Editor;
  onImport: (file: File) => void;
  importing: boolean;
};

export default function Toolbar({ editor, onImport, importing }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);

  // Re-render only when the formatting at the cursor changes.
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      block: e.isActive("heading", { level: 1 })
        ? "h1"
        : e.isActive("heading", { level: 2 })
          ? "h2"
          : e.isActive("heading", { level: 3 })
            ? "h3"
            : "p",
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();

  const setBlock = (value: string) => {
    if (value === "p") chain().setParagraph().run();
    else chain().setHeading({ level: Number(value[1]) as 1 | 2 | 3 }).run();
  };

  return (
    <div
      className="toolbar"
      role="toolbar"
      aria-label="Formatting"
      // Keep focus (and the selection) in the document when clicking a button,
      // otherwise keystrokes typed right after a click land on the button.
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) e.preventDefault();
      }}
    >
      <button className="tool" onClick={() => chain().undo().run()} disabled={!s.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
        ↶
      </button>
      <button className="tool" onClick={() => chain().redo().run()} disabled={!s.canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
        ↷
      </button>
      <span className="sep" aria-hidden />
      <label className="visually-hidden" htmlFor="block-style">Text style</label>
      <select id="block-style" className="select tool-select" value={s.block} onChange={(e) => setBlock(e.target.value)}>
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <span className="sep" aria-hidden />
      <Mark label="Bold" shortcut="Ctrl+B" active={s.bold} onClick={() => chain().toggleBold().run()}>
        <b>B</b>
      </Mark>
      <Mark label="Italic" shortcut="Ctrl+I" active={s.italic} onClick={() => chain().toggleItalic().run()}>
        <i style={{ fontFamily: "var(--serif)" }}>I</i>
      </Mark>
      <Mark label="Underline" shortcut="Ctrl+U" active={s.underline} onClick={() => chain().toggleUnderline().run()}>
        <u>U</u>
      </Mark>
      <Mark label="Strikethrough" shortcut="Ctrl+Shift+S" active={s.strike} onClick={() => chain().toggleStrike().run()}>
        <s>S</s>
      </Mark>
      <span className="sep" aria-hidden />
      <Mark label="Bulleted list" shortcut="Ctrl+Shift+8" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
        • List
      </Mark>
      <Mark label="Numbered list" shortcut="Ctrl+Shift+7" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
        1. List
      </Mark>
      <Mark label="Quote" shortcut="Ctrl+Shift+B" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>
        “ ”
      </Mark>
      <button
        className="tool"
        onClick={() => chain().unsetAllMarks().clearNodes().run()}
        title="Clear formatting"
      >
        Clear
      </button>
      <span className="sep" aria-hidden />
      <button
        className="tool"
        onClick={() => fileInput.current?.click()}
        disabled={importing}
        title="Insert the contents of a .txt, .md or .docx file at the cursor"
      >
        {importing ? "Inserting…" : "Insert from file"}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".txt,.md,.docx"
        className="visually-hidden"
        tabIndex={-1}
        aria-label="Insert from a .txt, .md or .docx file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImport(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function Mark(props: {
  label: string;
  shortcut: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className="tool"
      onClick={props.onClick}
      aria-pressed={props.active}
      aria-label={props.label}
      title={`${props.label} (${props.shortcut})`}
    >
      {props.children}
    </button>
  );
}
