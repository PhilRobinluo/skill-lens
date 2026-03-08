"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SkillDep {
  name: string;
  dependencies: string[];
  claudeMdRefs: Array<{ table: string; trigger: string }>;
}

export default function DependenciesPage() {
  const [skills, setSkills] = useState<SkillDep[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/skills");
        if (res.ok && !cancelled) {
          const data = await res.json();
          const list: SkillDep[] = data.skills.map((s: Record<string, unknown>) => ({
            name: s.name as string,
            dependencies: (s.dependencies as string[]) ?? [],
            claudeMdRefs: (s.claudeMdRefs as Array<{ table: string; trigger: string }>) ?? [],
          }));
          setSkills(list);
        }
      } catch { /* ignore */ } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Build dependency graph data
  const skillsWithDeps = skills.filter(s => s.dependencies.length > 0);
  const skillsWithRefs = skills.filter(s => s.claudeMdRefs.length > 0);
  const orphans = skills.filter(s => s.dependencies.length === 0 && s.claudeMdRefs.length === 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">加载 Skill 数据...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold">Skill 调用关系</h1>
        <p className="text-sm text-muted-foreground">
          {skills.length} 个 Skill · {skillsWithDeps.length} 个有依赖 · {skillsWithRefs.length} 个被 CLAUDE.md 路由 · {orphans.length} 个孤立
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Skills with CLAUDE.md routing */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">CLAUDE.md 路由的 Skill</CardTitle>
            <CardDescription>被 CLAUDE.md 路由表引用的 Skill（软编排）</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {skillsWithRefs.length === 0 ? (
                <p className="text-sm text-muted-foreground/60 italic">无路由引用</p>
              ) : (
                skillsWithRefs.map((s) => (
                  <div key={s.name} className="flex items-start gap-2 rounded border px-3 py-2">
                    <code className="shrink-0 text-xs font-medium">{s.name}</code>
                    <div className="flex flex-wrap gap-1">
                      {s.claudeMdRefs.map((ref, i) => (
                        <span key={i} className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
                          {ref.table}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Skills with explicit dependencies */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">显式依赖关系</CardTitle>
            <CardDescription>Skill 之间的直接调用依赖</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {skillsWithDeps.length === 0 ? (
                <p className="text-sm text-muted-foreground/60 italic">无显式依赖</p>
              ) : (
                skillsWithDeps.map((s) => (
                  <div key={s.name} className="rounded border px-3 py-2">
                    <code className="text-xs font-medium">{s.name}</code>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span>→</span>
                      {s.dependencies.map((dep) => (
                        <code key={dep} className="rounded bg-muted px-1 py-0.5">{dep}</code>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Orphan skills */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">孤立 Skill（未被编排）</CardTitle>
          <CardDescription>既没有 CLAUDE.md 路由引用，也没有依赖关系的 Skill</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {orphans.map((s) => (
              <code key={s.name} className="rounded border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
                {s.name}
              </code>
            ))}
            {orphans.length === 0 && (
              <p className="text-sm text-muted-foreground/60 italic">所有 Skill 都已被编排</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
