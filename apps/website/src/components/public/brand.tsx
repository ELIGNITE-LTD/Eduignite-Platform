import Image from "next/image";

/**
 * The EduIgnite mark. Uses the real logo file rather than an "EI" text
 * placeholder, so the site carries the same brand as the apps.
 */
export function BrandMark({
  size = 40,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/icon.png"
      alt="EduIgnite"
      width={size}
      height={size}
      className={className}
      priority
    />
  );
}

export function BrandLockup({
  size = 40,
  className = "",
  tone = "dark",
}: {
  size?: number;
  className?: string;
  tone?: "dark" | "light";
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandMark size={size} />
      <span className="flex flex-col leading-none">
        <span
          className={`text-lg font-black tracking-tight ${
            tone === "light" ? "text-white" : "text-[#12314d]"
          }`}
        >
          EduIgnite
        </span>
        <span
          className={`mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em] ${
            tone === "light" ? "text-white/60" : "text-[#0E7490]"
          }`}
        >
          School Platform
        </span>
      </span>
    </span>
  );
}
