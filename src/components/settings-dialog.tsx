"use client";

import { useState, useEffect } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useScope } from "@/contexts/scope-context";
import type { SkillRuntime } from "@/lib/types";

const MODEL_OPTIONS = [
  { value: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
  { value: "anthropic/claude-haiku-4", label: "Claude Haiku 4" },
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "openai/gpt-4o", label: "GPT-4o" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
];

export function SettingsDialog() {
  const { setRuntime } = useScope();
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("google/gemini-2.5-flash");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [defaultRuntime, setDefaultRuntime] = useState<SkillRuntime>("codex");
  const [saving, setSaving] = useState(false);

  // Load current status when dialog opens
  useEffect(() => {
    if (!open) return;
    const savedDefault = localStorage.getItem("skill-lens-default-runtime") as SkillRuntime | null;
    setDefaultRuntime(savedDefault || "codex");
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setHasApiKey(data.hasApiKey);
        setModel(data.aiModel);
        setApiKey(""); // never pre-fill the key
      })
      .catch(() => {});
  }, [open]);

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { aiModel: model };
      if (apiKey) body.openRouterApiKey = apiKey;

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setHasApiKey(data.hasApiKey);
        setApiKey("");
        localStorage.setItem("skill-lens-default-runtime", defaultRuntime);
        setRuntime(defaultRuntime);
        setOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        aria-label="Settings"
      >
        <Settings className="h-4 w-4" />
        {hasApiKey && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-green-500" />
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>设置</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/* ---------- AI Settings Section ---------- */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                AI 配置
              </h3>

              <div className="space-y-2">
                <Label>OpenRouter API Key</Label>
                <Input
                  type="password"
                  placeholder={hasApiKey ? "已配置（输入新值可覆盖）" : "sk-or-..."}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  从{" "}
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    openrouter.ai/keys
                  </a>{" "}
                  获取。Key 仅保存在本机应用数据目录的 settings.json。
                </p>
              </div>

              <div className="space-y-2">
                <Label>AI 模型</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ---------- Default Runtime Section ---------- */}
            <div className="space-y-4 border-t pt-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                默认视图
              </h3>
              <div className="space-y-2">
                <Label>启动后优先显示</Label>
                <Select value={defaultRuntime} onValueChange={(value) => setDefaultRuntime(value as SkillRuntime)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="codex">Codex</SelectItem>
                    <SelectItem value="claude">Claude</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  这是本机界面偏好。保存后会立即切换，并在下次打开时沿用。
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
