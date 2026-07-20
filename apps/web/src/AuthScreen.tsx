import { FormEvent, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { api, type AuthConfig } from "./api";
import { Button } from "./components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "./components/ui/field";
import { Input } from "./components/ui/input";

export default function AuthScreen({ onReady }: { onReady: () => void }) {
  const [config, setConfig] = useState<AuthConfig | null>(null),
    [mode, setMode] = useState<"login" | "register">("login"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const canRegister =
    config?.registrationMode === "open" || config?.bootstrapAvailable === true;
  useEffect(() => {
    void api
      .authConfig()
      .then(setConfig)
      .catch(() =>
        setConfig({
          registrationMode: "admin_only",
          allowWorkspaceCreate: false,
          bootstrapAvailable: false,
        }),
      );
  }, []);
  useEffect(() => {
    if (config && !canRegister && mode === "register") setMode("login");
  }, [canRegister, config, mode]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (mode === "register")
        await api.register({
          email: String(values.email),
          name: String(values.name),
          password: String(values.password),
          workspaceName: String(values.workspaceName),
        });
      await api.login(String(values.email), String(values.password));
      onReady();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "请求失败");
    } finally {
      setBusy(false);
    }
  }
  const closedHint =
    config?.registrationMode === "admin_only"
      ? "当前实例仅支持管理员开通账号，请联系管理员获取设置链接。"
      : "当前实例已关闭开放注册，请通过邀请链接加入工作区。";
  return (
    <main className="auth-page">
      <section className="auth-note">
        <span className="brand-mark">闲</span>
        <p>
          轻量协作，
          <br />
          清晰抵达。
        </p>
        <small>项目、看板与团队协作，都在一个安静的工作台里。</small>
      </section>
      <form className="auth-form" onSubmit={submit}>
        <div>
          <span className="eyebrow">XIAN WORKSPACE</span>
          <h1>{mode === "login" ? "欢迎回来" : "创建你的工作区"}</h1>
          <p>
            {mode === "login"
              ? "继续今天的工作。"
              : config?.bootstrapAvailable
                ? "首次部署，创建管理员账号与工作区。"
                : "几秒钟后即可开始协作。"}
          </p>
        </div>
        <FieldGroup>
          {mode === "register" ? (
            <>
              <Field>
                <FieldLabel htmlFor="auth-name">你的名字</FieldLabel>
                <Input id="auth-name" name="name" required maxLength={80} />
              </Field>
              <Field>
                <FieldLabel htmlFor="workspace-name">工作区名称</FieldLabel>
                <Input
                  id="workspace-name"
                  name="workspaceName"
                  required
                  maxLength={80}
                />
              </Field>
            </>
          ) : null}
          <Field>
            <FieldLabel htmlFor="auth-email">邮箱</FieldLabel>
            <Input
              id="auth-email"
              name="email"
              type="email"
              required
              autoComplete="email"
            />
          </Field>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="auth-password">密码</FieldLabel>
            <Input
              id="auth-password"
              name="password"
              type="password"
              required
              minLength={mode === "register" ? 10 : 1}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              aria-invalid={Boolean(error)}
            />
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
        </FieldGroup>
        <Button type="submit" size="lg" disabled={busy || !config}>
          {busy ? "请稍候…" : mode === "login" ? "登录" : "注册并进入"}
          <ArrowRight data-icon="inline-end" />
        </Button>
        {canRegister ? (
          <Button
            type="button"
            variant="link"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login"
              ? "还没有账号？创建工作区"
              : "已有账号？返回登录"}
          </Button>
        ) : config ? (
          <p className="auth-closed-note">{closedHint}</p>
        ) : null}
      </form>
    </main>
  );
}
