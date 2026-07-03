export function StatIcon({ icons, name }: { icons: Record<string, string> | null; name: string }) {
  const url = icons?.[name];
  if (!url) return null;
  return <img src={url} alt={name} className="h-3.5 w-3.5" />;
}
