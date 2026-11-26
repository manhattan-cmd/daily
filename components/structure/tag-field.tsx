"use client";

import { useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { FormSection } from "@/components/structure/structure-form-shell";
import { TagChip, TagGlyph } from "@/components/ui/tag-glyph";
import { useTags } from "@/components/analytics/tag-filter";
import { deleteTag, NEW_TAG_PREFIX, updateTag } from "@/lib/db/tags";
import { nextTagColor, normTagName, TAG_COLORS } from "@/lib/tags";
import { useIsBrutal } from "@/components/structure/brutal";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Kategori ve alt kategori formunun Etiketler bölümü.
 *
 * Bütün etiketler kapsül olarak dizili; dokununca bu yere takılır/çıkar.
 * Üstünden (kategoriden, üst kalemden) gelenler kesik çerçeveli ve
 * dokunulmaz — o etiket orada çıkarılır. "+ Yeni" yazı kutusu açar; yazılan
 * etiket kayıtta açılır, vazgeçilirse hiç açılmaz (`new:<ad>`, bkz.
 * settleTagIds). "Düzenle" etiketlerin kendisini (ad, renk, silme) yönetir —
 * bu yere değil her yere işler, o yüzden anında yazılır.
 */
export function TagField({
  value,
  onChange,
  inherited = [],
}: {
  /** Bu yerin kendi etiketleri; yeni yazılanlar `new:<ad>` */
  value: string[];
  onChange: (ids: string[]) => void;
  /** Üstünden gelen etiketler — kimlik ve nereden geldiği */
  inherited?: { id: string; from: string }[];
}) {
  const t = useT();
  const brutal = useIsBrutal();
  const tags = useTags();
  const [managing, setManaging] = useState(false);

  return (
    <FormSection
      label={t("tags.title")}
      action={
        (tags?.length ?? 0) > 0 && (
          <button
            type="button"
            data-tag-manage=""
            onClick={() => setManaging((v) => !v)}
            className={cn(
              "rounded-lg px-2 py-px text-[11.5px] font-bold",
              brutal ? "border-2 border-line bg-paper text-ink" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {managing ? t("action.done") : t("action.edit")}
          </button>
        )
      }
    >
      {managing ? (
        <div data-tag-manage-list="" className="flex flex-col gap-1.5">
          {(tags ?? []).map((tag) => (
            <ManageRow key={tag.id} id={tag.id} name={tag.name} color={tag.color} />
          ))}
          <p className={cn("text-[11px] leading-snug", brutal ? "text-ink/60" : "text-muted-foreground")}>{t("tags.manageHint")}</p>
        </div>
      ) : (
        <TagPicker value={value} onChange={onChange} inherited={inherited} />
      )}
    </FormSection>
  );
}

/**
 * Etiket kapsülleri — bütün etiketler, seçililer dolu; sonda "+ Yeni".
 * Formda (TagField) ve girdi düzenleme penceresinin Etiketler bölümünde.
 */
export function TagPicker({
  value,
  onChange,
  inherited = [],
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  inherited?: { id: string; from: string }[];
}) {
  const t = useT();
  const brutal = useIsBrutal();
  const tags = useTags();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const inheritedIds = new Set(inherited.map((x) => x.id));
  const pending = value.filter((id) => id.startsWith(NEW_TAG_PREFIX));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const commitDraft = () => {
    const name = draft.trim();
    setDraft("");
    setAdding(false);
    if (!name) return;
    // Aynı adda etiket varsa onu tak — ad tekil
    const same = tags?.find((x) => normTagName(x.name) === normTagName(name));
    const id = same ? same.id : `${NEW_TAG_PREFIX}${name}`;
    if (!value.includes(id)) onChange([...value, id]);
  };
  const pendingColor = nextTagColor(tags ?? []);

  // Üstünden gelenler neden kesik çerçeveli: nereden geldiği altta yazar
  const fromLines = inherited
    .map((x) => {
      const tag = tags?.find((y) => y.id === x.id);
      return tag ? `${tag.name} · ${t("tags.fromParent", { name: x.from })}` : null;
    })
    .filter(Boolean);

  return (
    <div className="flex flex-col gap-2">
        <div data-tag-field="" className="flex flex-wrap gap-1.5">
          {inherited.map((x) => {
            const tag = tags?.find((y) => y.id === x.id);
            if (!tag) return null;
            return <TagChip key={`i:${x.id}`} name={tag.name} color={tag.color} muted title={t("tags.fromParent", { name: x.from })} />;
          })}
          {(tags ?? [])
            .filter((tag) => !inheritedIds.has(tag.id))
            .map((tag) => (
              <TagChip key={tag.id} name={tag.name} color={tag.color} on={value.includes(tag.id)} onClick={() => toggle(tag.id)} />
            ))}
          {pending.map((id) => (
            <TagChip
              key={id}
              name={id.slice(NEW_TAG_PREFIX.length)}
              color={pendingColor}
              onClick={() => toggle(id)}
              trailing={<X className="h-3 w-3 shrink-0 opacity-60" strokeWidth={3} />}
            />
          ))}
          {adding ? (
            <span
              className={cn(
                "flex items-center gap-1 rounded-full py-[2px] pl-2 pr-[3px]",
                brutal ? "border-[1.5px] border-line bg-paper" : "bg-[var(--sf-2)] ring-1 ring-inset ring-[var(--ln-1)]"
              )}
            >
              <TagGlyph color={pendingColor} size={13} />
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitDraft();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setDraft("");
                    setAdding(false);
                  }
                }}
                onBlur={commitDraft}
                placeholder={t("tags.newPlaceholder")}
                aria-label={t("tags.new")}
                className="w-36 bg-transparent text-[13px] font-bold outline-none placeholder:font-medium placeholder:opacity-50"
              />
              <button
                type="button"
                // Basılınca kutu odağı kaybetmeden önce kaydet
                onMouseDown={(e) => e.preventDefault()}
                onClick={commitDraft}
                aria-label={t("tags.new")}
                className={cn("flex h-6 w-6 items-center justify-center rounded-full", brutal ? "bg-fill-[#4ade80] text-ink border-[1.5px] border-line" : "bg-primary text-primary-foreground")}
              >
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </button>
            </span>
          ) : (
            <button
              type="button"
              data-tag-new=""
              onClick={() => setAdding(true)}
              className={cn(
                "flex items-center gap-1 rounded-full py-[3px] pl-2 pr-2.5 text-[13px] leading-[18px]",
                brutal ? "border-[1.5px] border-dashed border-ink/60 font-bold text-ink" : "font-medium text-muted-foreground ring-1 ring-inset ring-[var(--ln-1)]"
              )}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={3} />
              {t("tags.new")}
            </button>
          )}
        </div>
      {fromLines.length > 0 && (
        <p data-tag-from="" className={cn("text-[11px] font-semibold leading-snug", brutal ? "text-ink/60" : "text-muted-foreground")}>
          {fromLines.join(" · ")}
        </p>
      )}
    </div>
  );
}

/** Etiketin kendisini yönetme satırı — renk, ad, sil (iki dokunuşla) */
function ManageRow({ id, name, color }: { id: string; name: string; color: string }) {
  const t = useT();
  const brutal = useIsBrutal();
  const [text, setText] = useState(name);
  const [armed, setArmed] = useState(false);
  const nextColor = () => {
    const i = TAG_COLORS.indexOf(color as (typeof TAG_COLORS)[number]);
    void updateTag(id, { color: TAG_COLORS[(i + 1) % TAG_COLORS.length] });
  };
  return (
    <div
      data-tag-row=""
      className={cn(
        "flex items-center gap-2 rounded-xl px-2 py-1.5",
        brutal ? "border-[1.5px] border-line bg-paper" : "bg-[var(--sf-2)] ring-1 ring-inset ring-[var(--ln-1)]"
      )}
    >
      <button type="button" onClick={nextColor} aria-label={t("tags.color")} title={t("tags.color")} className="flex h-7 w-8 items-center justify-center">
        <TagGlyph color={color} size={16} />
      </button>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text.trim() && text.trim() !== name) void updateTag(id, { name: text });
          else setText(name);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        aria-label={t("tags.rename")}
        className="min-w-0 flex-1 bg-transparent text-[14px] font-bold outline-none"
      />
      <button
        type="button"
        onClick={() => (armed ? void deleteTag(id) : setArmed(true))}
        onBlur={() => setArmed(false)}
        aria-label={t("tags.delete")}
        className={cn(
          "flex h-7 items-center justify-center gap-1 rounded-lg px-1.5 text-[12px] font-bold",
          armed ? "bg-fill-[#ef4444] text-white" : brutal ? "text-ink/70" : "text-muted-foreground"
        )}
      >
        <Trash2 className="h-4 w-4" strokeWidth={2.4} />
        {armed && t("tags.deleteConfirm")}
      </button>
    </div>
  );
}
