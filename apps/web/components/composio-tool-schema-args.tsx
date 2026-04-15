"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type JsonSchema = Record<string, unknown>;

export function composioSchemaHasRenderableFields(schema: unknown): boolean {
  if (!schema || typeof schema !== "object") return false;
  const s = schema as JsonSchema;
  if (s.allOf || s.anyOf || s.oneOf || s.$ref) return false;
  if (s.type === "object" && s.properties && typeof s.properties === "object") {
    return Object.keys(s.properties as object).length > 0;
  }
  return false;
}

function schemaType(prop: JsonSchema): string | null {
  const t = prop.type;
  if (typeof t === "string") return t;
  if (Array.isArray(t) && t.length > 0 && typeof t[0] === "string") return t[0] as string;
  return null;
}

function isProbablyEnum(prop: JsonSchema): string[] | null {
  const e = prop.enum;
  if (!Array.isArray(e) || e.length === 0) return null;
  const allStrings = e.every((x) => typeof x === "string" || typeof x === "number");
  if (!allStrings) return null;
  return e.map((x) => String(x));
}

type PropFieldProps = {
  name: string;
  propSchema: JsonSchema;
  value: unknown;
  onChange: (v: unknown) => void;
  required: boolean;
  fieldClass: string;
};

function PropertyField({
  name,
  propSchema,
  value,
  onChange,
  required,
  fieldClass,
}: PropFieldProps) {
  const label = typeof propSchema.title === "string" ? propSchema.title : name;
  const desc = typeof propSchema.description === "string" ? propSchema.description : undefined;
  const enumVals = isProbablyEnum(propSchema);
  const st = schemaType(propSchema);

  if (enumVals) {
    const sv = value === undefined || value === null ? "" : String(value);
    return (
      <div className="space-y-1.5">
        <Label className="text-xs text-[#150A35]">
          {label}
          {required ? <span className="text-red-500"> *</span> : null}
        </Label>
        <Select
          value={sv || "__empty__"}
          onValueChange={(v) => onChange(v === "__empty__" ? undefined : v)}
        >
          <SelectTrigger className={cn("h-9 w-full", fieldClass)}>
            <SelectValue placeholder={required ? "Select…" : "Optional"} />
          </SelectTrigger>
          <SelectContent>
            {!required ? <SelectItem value="__empty__">—</SelectItem> : null}
            {enumVals.map((ev) => (
              <SelectItem key={ev} value={ev}>
                {ev}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {desc ? <p className="text-[10px] leading-snug text-echo-text-muted">{desc}</p> : null}
      </div>
    );
  }

  if (st === "boolean") {
    const checked = Boolean(value);
    return (
      <label className="flex cursor-pointer items-start gap-2 rounded-md border border-[#150A35]/08 bg-white/80 px-3 py-2">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="text-xs leading-snug text-[#150A35]">
          {label}
          {required ? <span className="text-red-500"> *</span> : null}
          {desc ? (
            <span className="mt-0.5 block font-normal text-echo-text-muted">{desc}</span>
          ) : null}
        </span>
      </label>
    );
  }

  if (st === "number" || st === "integer") {
    const n = value === undefined || value === null ? "" : String(value);
    return (
      <div className="space-y-1.5">
        <Label className="text-xs text-[#150A35]">
          {label}
          {required ? <span className="text-red-500"> *</span> : null}
        </Label>
        <Input
          type="number"
          value={n}
          onChange={(e) => {
            const t = e.target.value;
            if (t === "") {
              onChange(undefined);
              return;
            }
            const num = st === "integer" ? parseInt(t, 10) : parseFloat(t);
            onChange(Number.isFinite(num) ? num : t);
          }}
          className={cn("h-9 text-sm", fieldClass)}
        />
        {desc ? <p className="text-[10px] leading-snug text-echo-text-muted">{desc}</p> : null}
      </div>
    );
  }

  if (st === "object" || st === "array") {
    return (
      <JsonBlobField
        label={label}
        required={required}
        st={st}
        value={value}
        onChange={onChange}
        desc={desc}
        fieldClass={fieldClass}
      />
    );
  }

  const format = typeof propSchema.format === "string" ? propSchema.format : "";
  const isEmail = format === "email";
  const sv = value === undefined || value === null ? "" : String(value);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-[#150A35]">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </Label>
      <Input
        type={isEmail ? "email" : "text"}
        value={sv}
        onChange={(e) => onChange(e.target.value)}
        className={cn("h-9 text-sm", fieldClass)}
      />
      {desc ? <p className="text-[10px] leading-snug text-echo-text-muted">{desc}</p> : null}
    </div>
  );
}

function safeStringify(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return "";
  }
}

function JsonBlobField({
  label,
  required,
  st,
  value,
  onChange,
  desc,
  fieldClass,
}: {
  label: string;
  required: boolean;
  st: string;
  value: unknown;
  onChange: (v: unknown) => void;
  desc?: string;
  fieldClass: string;
}) {
  const initial = safeStringify(value);
  const [text, setText] = useState(initial);
  useEffect(() => {
    setText(safeStringify(value));
  }, [value]);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-[#150A35]">
        {label} (JSON)
        {required ? <span className="text-red-500"> *</span> : null}
      </Label>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const t = text.trim();
          if (!t) {
            onChange(undefined);
            return;
          }
          try {
            onChange(JSON.parse(t) as unknown);
          } catch {
            setText(safeStringify(value));
          }
        }}
        rows={st === "array" ? 3 : 4}
        placeholder={st === "array" ? "[ ]" : "{ }"}
        className={cn("font-mono text-xs", fieldClass)}
      />
      {desc ? <p className="text-[10px] leading-snug text-echo-text-muted">{desc}</p> : null}
    </div>
  );
}

export function ComposioToolSchemaArgsFields({
  schema,
  value,
  onChange,
  fieldClass,
}: {
  schema: JsonSchema;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  fieldClass: string;
}) {
  const props = (schema.properties ?? {}) as Record<string, JsonSchema>;
  const required = useMemo(
    () => new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []),
    [schema.required],
  );

  const keys = useMemo(() => Object.keys(props).sort(), [props]);

  if (keys.length === 0) {
    return (
      <div className="rounded-md border border-[#150A35]/08 bg-white/90 px-3 py-3 text-sm text-[#150A35]">
        No input fields for this action.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {keys.map((key) => (
        <PropertyField
          key={key}
          name={key}
          propSchema={props[key] ?? {}}
          value={value[key]}
          required={required.has(key)}
          fieldClass={fieldClass}
          onChange={(v) => {
            const next = { ...value };
            if (v === undefined || (typeof v === "string" && v === "" && !required.has(key))) {
              delete next[key];
            } else {
              next[key] = v as unknown;
            }
            onChange(next);
          }}
        />
      ))}
    </div>
  );
}
