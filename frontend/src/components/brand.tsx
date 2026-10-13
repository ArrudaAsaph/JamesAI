export function Brand({ light = false }: { light?: boolean }) {
  return <span className={`text-[25px] font-medium tracking-tight ${light ? 'text-white' : 'text-ink'}`} aria-label="Charles">charles</span>;
}
