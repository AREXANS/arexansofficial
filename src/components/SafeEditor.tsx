const LIMIT = 1_500_000;

interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}

/** Textarea that refuses to render huge scripts (prevents browser freeze). */
export default function SafeEditor({ value, onChange, className, placeholder }: Props) {
  if (value.length > LIMIT) {
    return (
      <div className={`${className} flex flex-col items-center justify-center gap-2 text-center p-6`}>
        <p className="font-semibold">File besar ({(value.length / 1048576).toFixed(1)} MB)</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          Editor dimatikan agar browser tidak freeze. Script tetap tersimpan dan bisa disimpan, diganti lewat upload, atau diunduh.
        </p>
      </div>
    );
  }
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} className={className}
      placeholder={placeholder} spellCheck={false} />
  );
}
