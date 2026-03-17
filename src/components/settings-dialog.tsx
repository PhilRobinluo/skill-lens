"use client";

import { useState, useEffect, useCallback } from "react";
import { Settings, Wifi, WifiOff, Loader2, AppWindow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import type { OpenClawSshConfig } from "@/lib/types";

const MODEL_OPTIONS = [
  { value: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
  { value: "anthropic/claude-haiku-4", label: "Claude Haiku 4" },
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "openai/gpt-4o", label: "GPT-4o" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
];

const DEFAULT_SSH_CONFIG: OpenClawSshConfig = {
  host: "",
  port: 22,
  user: "",
  keyPath: "",
  skillsPath: "~/.openclaw/",
  runAsUser: "",
  enabled: false,
};

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("google/gemini-2.5-flash");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [saving, setSaving] = useState(false);

  // Dock install state
  const [dockInstalled, setDockInstalled] = useState<boolean | null>(null);
  const [dockLoading, setDockLoading] = useState(false);

  // OpenClaw SSH state
  const [sshConfig, setSshConfig] = useState<OpenClawSshConfig>(DEFAULT_SSH_CONFIG);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);

  // Load current status when dialog opens
  useEffect(() => {
    if (!open) return;
    fetch("/api/dock-install")
      .then((r) => r.json())
      .then((data) => setDockInstalled(data.installed))
      .catch(() => {});
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setHasApiKey(data.hasApiKey);
        setModel(data.aiModel);
        setApiKey(""); // never pre-fill the key
        if (data.openClawSsh) {
          setSshConfig({ ...DEFAULT_SSH_CONFIG, ...data.openClawSsh });
          // Auto-expand advanced if runAsUser or keyPath is configured
          if (data.openClawSsh.runAsUser || data.openClawSsh.keyPath) {
            setShowAdvanced(true);
          }
        }
      })
      .catch(() => {});
    // Reset connection result
    setConnectionResult(null);
  }, [open]);

  const updateSshField = useCallback(
    <K extends keyof OpenClawSshConfig>(field: K, value: OpenClawSshConfig[K]) => {
      setSshConfig((prev) => ({ ...prev, [field]: value }));
      setConnectionResult(null); // clear previous test result on field change
    },
    [],
  );

  async function handleTestConnection() {
    setTestingConnection(true);
    setConnectionResult(null);
    try {
      const res = await fetch("/api/openclaw-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sshConfig),
      });
      const data = await res.json();
      setConnectionResult(data);
    } catch {
      setConnectionResult({ success: false, message: "请求失败" });
    } finally {
      setTestingConnection(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { aiModel: model };
      if (apiKey) body.openRouterApiKey = apiKey;
      body.openClawSsh = sshConfig;

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setHasApiKey(data.hasApiKey);
        setApiKey("");
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
                  获取。Key 仅保存在本地 data/settings.json。
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

            {/* ---------- OpenClaw SSH Section ---------- */}
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  OpenClaw 远程连接
                </h3>
                <div className="flex items-center gap-2">
                  <Label htmlFor="openclaw-enabled" className="text-xs text-muted-foreground">
                    {sshConfig.enabled ? "已启用" : "已禁用"}
                  </Label>
                  <Switch
                    id="openclaw-enabled"
                    checked={sshConfig.enabled}
                    onCheckedChange={(checked) => updateSshField("enabled", checked)}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                通过 SSH 连接远程 OpenClaw 实例，扫描远程 Skills 目录。
              </p>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="ssh-host">主机地址</Label>
                  <Input
                    id="ssh-host"
                    placeholder="192.168.1.100 或 SSH 别名"
                    value={sshConfig.host}
                    onChange={(e) => updateSshField("host", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ssh-port">端口</Label>
                  <Input
                    id="ssh-port"
                    type="number"
                    placeholder="22"
                    value={sshConfig.port}
                    onChange={(e) => updateSshField("port", Number(e.target.value) || 22)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ssh-user">用户名</Label>
                <Input
                  id="ssh-user"
                  placeholder="root"
                  value={sshConfig.user}
                  onChange={(e) => updateSshField("user", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ssh-skills-path">OpenClaw 根目录</Label>
                <Input
                  id="ssh-skills-path"
                  placeholder="~/.openclaw/"
                  value={sshConfig.skillsPath}
                  onChange={(e) => updateSshField("skillsPath", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  自动发现该目录下所有 skills 子目录（workspace、extensions 等）。
                </p>
              </div>

              {/* Advanced options (collapsed by default) */}
              <div>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                  onClick={() => setShowAdvanced((v) => !v)}
                >
                  {showAdvanced ? "收起高级选项 ▲" : "高级选项 ▼"}
                </button>
              </div>

              {showAdvanced && (
                <div className="space-y-4 rounded-md border p-3 bg-muted/30">
                  <div className="space-y-1.5">
                    <Label htmlFor="ssh-key">SSH 密钥路径</Label>
                    <Input
                      id="ssh-key"
                      placeholder="留空则使用系统默认密钥"
                      value={sshConfig.keyPath}
                      onChange={(e) => updateSshField("keyPath", e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      支持 SSH config 中配置的别名（如 Host 别名可直接填在主机地址）。
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ssh-run-as">运行用户（sudo 切换）</Label>
                    <Input
                      id="ssh-run-as"
                      placeholder="留空 = SSH 用户即 OpenClaw 用户"
                      value={sshConfig.runAsUser}
                      onChange={(e) => updateSshField("runAsUser", e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      仅当 SSH 登录用户与 OpenClaw 运行用户不同时填写。需要免密 sudo 权限。
                    </p>
                  </div>
                </div>
              )}

              {/* Test connection button + result */}
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={testingConnection || !sshConfig.host}
                >
                  {testingConnection ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      测试中...
                    </>
                  ) : (
                    "测试连接"
                  )}
                </Button>

                {connectionResult && (
                  <div className="flex items-center gap-1.5 text-sm">
                    {connectionResult.success ? (
                      <>
                        <Wifi className="h-3.5 w-3.5 text-green-500" />
                        <span className="text-green-600">
                          {connectionResult.message}
                          {connectionResult.latencyMs != null && (
                            <span className="text-muted-foreground ml-1">
                              ({connectionResult.latencyMs}ms)
                            </span>
                          )}
                        </span>
                      </>
                    ) : (
                      <>
                        <WifiOff className="h-3.5 w-3.5 text-red-500" />
                        <span className="text-red-600">{connectionResult.message}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ---------- Dock Install Section ---------- */}
            <div className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                桌面快捷方式
              </h3>
              <p className="text-xs text-muted-foreground">
                安装到 Dock 后，点击图标即可一键启动技能透镜。
              </p>
              <div className="flex items-center gap-3">
                {dockInstalled ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={dockLoading}
                    onClick={async () => {
                      setDockLoading(true);
                      try {
                        const res = await fetch("/api/dock-install", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "uninstall" }),
                        });
                        const data = await res.json();
                        setDockInstalled(data.installed);
                      } finally {
                        setDockLoading(false);
                      }
                    }}
                  >
                    {dockLoading ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <AppWindow className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    从 Dock 移除
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    size="sm"
                    disabled={dockLoading || dockInstalled === null}
                    onClick={async () => {
                      setDockLoading(true);
                      try {
                        const res = await fetch("/api/dock-install", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "install" }),
                        });
                        const data = await res.json();
                        setDockInstalled(data.installed);
                      } finally {
                        setDockLoading(false);
                      }
                    }}
                  >
                    {dockLoading ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <AppWindow className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    安装到 Dock
                  </Button>
                )}
                {dockInstalled && (
                  <span className="text-xs text-green-600">已安装</span>
                )}
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
