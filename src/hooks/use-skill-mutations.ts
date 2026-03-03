import { useCallback, useRef, useEffect } from "react";

function useDebounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number,
): T {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const debounced = useCallback(
    (...args: unknown[]) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => fnRef.current(...args), delay);
    },
    [delay],
  ) as T;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return debounced;
}

interface UseSkillMutationsOptions {
  skillName: string | null;
  onUpdated: () => void;
}

export function useSkillMutations({ skillName, onUpdated }: UseSkillMutationsOptions) {
  const patchTags = useCallback(
    async (body: Record<string, unknown>) => {
      if (!skillName) return;
      await fetch(`/api/skills/${encodeURIComponent(skillName)}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      onUpdated();
    },
    [skillName, onUpdated],
  );

  const putDeps = useCallback(
    async (dependencies: string[]) => {
      if (!skillName) return;
      await fetch(`/api/skills/${encodeURIComponent(skillName)}/deps`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dependencies }),
      });
      onUpdated();
    },
    [skillName, onUpdated],
  );

  const patchNotes = useCallback(
    async (notesValue: string) => {
      if (!skillName) return;
      await fetch(`/api/skills/${encodeURIComponent(skillName)}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesValue }),
      });
      onUpdated();
    },
    [skillName, onUpdated],
  );

  const debouncedPatchNotes = useDebounce(
    (value: unknown) => patchNotes(value as string),
    800,
  );

  return {
    patchTags,
    putDeps,
    patchNotes,
    debouncedPatchNotes,
  };
}
