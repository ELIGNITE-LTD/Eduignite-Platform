"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bold, Heading2, Heading3, Image as ImageIcon, Italic, Link2, List, ListOrdered, Quote, RemoveFormatting } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTr } from "./shared";

/**
 * A small accessible rich-text editor (contenteditable + toolbar, no extra
 * dependency). It produces the same limited HTML the server accepts: headings,
 * paragraphs, lists, bold, italic, quotes, https links and the school's own
 * uploaded images. The server sanitises on save and again on every read, so the
 * editor never has to be trusted.
 */
export function RichTextEditor({
  value,
  onChange,
  onUploadImage,
  label,
  disabled,
  resetKey,
  error,
}: {
  value: string;
  onChange: (html: string) => void;
  /** Uploads a file to the school and returns the URL to embed. */
  onUploadImage?: (file: File) => Promise<string>;
  label: string;
  disabled?: boolean;
  /** Change this to load a different document into the editor. */
  resetKey: string;
  error?: string;
}) {
  const tr = useTr();
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");
  const [linkError, setLinkError] = useState("");
  const [busy, setBusy] = useState(false);

  // Load the document only when it changes identity, so typing never moves the caret.
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const emit = useCallback(() => {
    if (ref.current) onChange(ref.current.innerHTML);
  }, [onChange]);

  const remember = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && ref.current?.contains(selection.anchorNode)) {
      savedRange.current = selection.getRangeAt(0).cloneRange();
    }
  };
  const restore = () => {
    ref.current?.focus();
    const selection = window.getSelection();
    if (selection && savedRange.current) {
      selection.removeAllRanges();
      selection.addRange(savedRange.current);
    }
  };

  const run = (command: string, arg?: string) => {
    restore();
    document.execCommand(command, false, arg);
    emit();
    remember();
  };

  const applyLink = () => {
    let url = linkUrl.trim();
    if (!/^https:\/\//i.test(url)) {
      setLinkError(tr("Links must start with https://", "Les liens doivent commencer par https://"));
      return;
    }
    try {
      url = new URL(url).toString();
    } catch {
      setLinkError(tr("This address is not valid.", "Cette adresse n'est pas valide."));
      return;
    }
    setLinkError("");
    setLinkOpen(false);
    run("createLink", url);
    setLinkUrl("https://");
  };

  const pickImage = async (file: File | undefined) => {
    if (!file || !onUploadImage) return;
    setBusy(true);
    try {
      const url = await onUploadImage(file);
      run("insertImage", url);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const tools: Array<[string, string, React.ReactNode, () => void]> = [
    [tr("Heading", "Titre"), "h2", <Heading2 key="h2" className="h-4 w-4" />, () => run("formatBlock", "h2")],
    [tr("Sub-heading", "Sous-titre"), "h3", <Heading3 key="h3" className="h-4 w-4" />, () => run("formatBlock", "h3")],
    [tr("Bold", "Gras"), "b", <Bold key="b" className="h-4 w-4" />, () => run("bold")],
    [tr("Italic", "Italique"), "i", <Italic key="i" className="h-4 w-4" />, () => run("italic")],
    [tr("Bulleted list", "Liste a puces"), "ul", <List key="ul" className="h-4 w-4" />, () => run("insertUnorderedList")],
    [tr("Numbered list", "Liste numerotee"), "ol", <ListOrdered key="ol" className="h-4 w-4" />, () => run("insertOrderedList")],
    [tr("Quote", "Citation"), "q", <Quote key="q" className="h-4 w-4" />, () => run("formatBlock", "blockquote")],
    [tr("Paragraph", "Paragraphe"), "p", <RemoveFormatting key="p" className="h-4 w-4" />, () => run("formatBlock", "p")],
  ];

  return (
    <div className={cn("rounded-xl border", error ? "border-destructive" : "border-input", disabled && "opacity-70")}>
      <div role="toolbar" aria-label={tr("Text formatting", "Mise en forme du texte")} className="flex flex-wrap items-center gap-1 border-b bg-muted/40 p-1.5">
        {tools.map(([name, key, icon, action]) => (
          <Button
            key={key}
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title={name}
            aria-label={name}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={action}
          >
            {icon}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={tr("Add a link", "Ajouter un lien")}
          aria-label={tr("Add a link", "Ajouter un lien")}
          aria-expanded={linkOpen}
          disabled={disabled}
          onMouseDown={(e) => { e.preventDefault(); remember(); }}
          onClick={() => setLinkOpen((v) => !v)}
        >
          <Link2 className="h-4 w-4" />
        </Button>
        {onUploadImage ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title={tr("Insert an image", "Inserer une image")}
              aria-label={tr("Insert an image", "Inserer une image")}
              disabled={disabled || busy}
              onMouseDown={(e) => { e.preventDefault(); remember(); }}
              onClick={() => fileRef.current?.click()}
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => pickImage(e.target.files?.[0])} />
          </>
        ) : null}
      </div>

      {linkOpen ? (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 p-2">
          <Input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } }}
            aria-label={tr("Link address", "Adresse du lien")}
            className="h-9 max-w-md flex-1"
            inputMode="url"
          />
          <Button type="button" size="sm" onClick={applyLink}>{tr("Add link", "Ajouter")}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setLinkOpen(false)}>{tr("Cancel", "Annuler")}</Button>
          {linkError ? <p role="alert" className="w-full text-xs text-destructive">{linkError}</p> : null}
        </div>
      ) : null}

      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        aria-invalid={error ? true : undefined}
        contentEditable={!disabled}
        suppressContentEditableWarning
        tabIndex={0}
        onInput={emit}
        onBlur={() => { remember(); emit(); }}
        onKeyUp={remember}
        onMouseUp={remember}
        onPaste={(e) => {
          // Paste as plain text: no foreign styles, scripts or layout.
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
        className="prose prose-sm max-w-none min-h-[240px] overflow-auto px-4 py-3 text-sm leading-7 outline-none focus-visible:ring-2 focus-visible:ring-ring [&_blockquote]:border-l-4 [&_blockquote]:pl-3 [&_blockquote]:italic [&_h2]:text-xl [&_h2]:font-bold [&_h3]:text-lg [&_h3]:font-semibold [&_img]:max-h-64 [&_img]:rounded-md [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 [&_a]:text-blue-700 [&_a]:underline"
      />
      {error ? <p role="alert" className="px-4 pb-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
