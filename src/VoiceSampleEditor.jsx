import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, forwardRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  emDelimiter: "*",
});

/**
 * 클립보드/첨부 이미지를 JPEG로 줄여 data URL로 만든다. 학습 API·저장 용량을 맞추기 위함.
 */
function compressImageToDataUrl(file, maxEdge = 960, maxDataUrlChars = 280_000) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("이미지 파일만 붙여넣을 수 있습니다."));
      return;
    }
    const blobUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      let { width, height } = img;
      const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("캔버스를 사용할 수 없습니다."));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.88;
      let dataUrl = canvas.toDataURL("image/jpeg", quality);
      while (dataUrl.length > maxDataUrlChars && quality > 0.42) {
        quality -= 0.06;
        dataUrl = canvas.toDataURL("image/jpeg", quality);
      }
      if (dataUrl.length > maxDataUrlChars) {
        reject(new Error("이미지가 너무 커서 붙여넣을 수 없습니다. 더 작은 이미지를 사용해 주세요."));
        return;
      }
      resolve(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error("이미지를 읽지 못했습니다."));
    };
    img.src = blobUrl;
  });
}

function htmlToMarkdown(html) {
  return turndown.turndown(html || "").trim();
}

/**
 * TipTap 기반 말투 학습용 본문 편집기. HTML 붙여넣기·이미지 붙여넣기 후 마크다운으로보낸다.
 */
const VoiceSampleEditor = forwardRef(function VoiceSampleEditor(
  { disabled, resetKey, placeholder, onMarkdownChange },
  ref
) {
  const editorRef = useRef(null);
  const debounceRef = useRef(null);
  const onMarkdownChangeRef = useRef(onMarkdownChange);
  onMarkdownChangeRef.current = onMarkdownChange;

  const emitMarkdown = useCallback((ed) => {
    if (!ed) return;
    const md = htmlToMarkdown(ed.getHTML());
    const cb = onMarkdownChangeRef.current;
    if (!cb) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      cb(md);
    }, 320);
  }, []);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Placeholder.configure({
        placeholder:
          placeholder ||
          "블로그 글을 그대로 붙여 넣어 보세요. 사진·스크린샷도 붙여넣기되며, 학습 전에 이미지는 JPEG로 줄여 마크다운으로 변환됩니다.",
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: { class: "voice-sample-editor-img" },
      }),
    ],
    [placeholder]
  );

  const editor = useEditor(
    {
      extensions,
      editable: !disabled,
      content: "",
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: "voice-sample-editor-inner",
          spellcheck: "true",
        },
        handlePaste(view, event) {
          const ed = editorRef.current;
          if (!ed) return false;
          const cd = event.clipboardData;
          if (!cd) return false;
          const imageItem = [...cd.items].find((it) => it.type.startsWith("image/"));
          if (imageItem) {
            event.preventDefault();
            const file = imageItem.getAsFile();
            if (!file) return true;
            compressImageToDataUrl(file)
              .then((dataUrl) => {
                ed.chain().focus().setImage({ src: dataUrl }).run();
                emitMarkdown(ed);
              })
              .catch((err) => {
                window.alert(err?.message || "이미지를 붙여넣지 못했습니다.");
              });
            return true;
          }
          return false;
        },
        handleDrop(view, event) {
          const ed = editorRef.current;
          if (!ed) return false;
          const dt = event.dataTransfer;
          if (!dt?.files?.length) return false;
          const file = [...dt.files].find((f) => f.type.startsWith("image/"));
          if (!file) return false;
          event.preventDefault();
          compressImageToDataUrl(file)
            .then((dataUrl) => {
              ed.chain().focus().setImage({ src: dataUrl }).run();
              emitMarkdown(ed);
            })
            .catch((err) => {
              window.alert(err?.message || "이미지를 놓지 못했습니다.");
            });
          return true;
        },
      },
      onCreate({ editor: ed }) {
        editorRef.current = ed;
      },
      onDestroy() {
        editorRef.current = null;
      },
      onUpdate({ editor: ed }) {
        emitMarkdown(ed);
      },
    },
    [extensions, resetKey]
  );

  useEffect(() => {
    if (!editor) return undefined;
    editor.setEditable(!disabled);
    return undefined;
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return undefined;
    editor.commands.clearContent();
    emitMarkdown(editor);
    return undefined;
  }, [editor, resetKey, emitMarkdown]);

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown() {
        const ed = editorRef.current;
        if (!ed) return "";
        return htmlToMarkdown(ed.getHTML());
      },
      clear() {
        const ed = editorRef.current;
        if (!ed) return;
        ed.commands.clearContent();
        emitMarkdown(ed);
      },
    }),
    [emitMarkdown]
  );

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  if (!editor) {
    return <div className="voice-sample-editor voice-sample-editor--loading">에디터 준비 중…</div>;
  }

  return (
    <div className={`voice-sample-editor ${disabled ? "voice-sample-editor--disabled" : ""}`}>
      <EditorContent editor={editor} />
    </div>
  );
});

export default VoiceSampleEditor;
