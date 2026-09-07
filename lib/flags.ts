export function hasFlag(args: unknown, flag: string) {
  return typeof args === "string" && args.split(/\s+/).includes(flag);
}
