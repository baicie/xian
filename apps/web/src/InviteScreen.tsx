import { FormEvent, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { api } from "./api";
import { Button } from "./components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "./components/ui/field";
import { Input } from "./components/ui/input";

type InvitePreview = {
  workspaceName: string;
  email: string;
  role: string;
  expired: boolean;
  revoked: boolean;
  accepted: boolean;
  usable: boolean;
};

export default function InviteScreen({
  token,
  onReady,
}: {
  token: string;
  onReady: () => void;
}) {
  const [preview, setPreview] = useState<InvitePreview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [needsRegister, setNeedsRegister] = useState(true);
  useEffect(() => {
    void api
      .previewInvite(token)
      .then(setPreview)
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "邀请无效"),
      );
  }, [token]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (needsRegister) {
        await api.registerInvite({
          token,
          name: String(values.name),
          password: String(values.password),
        });
      } else {
        await api.login(String(values.email), String(values.password));
        await api.acceptInvite(token);
      }
      onReady();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  if (!preview && !error)
    return <main className="boot">正在加载邀请…</main>;
  if (error && !preview)
    return (
      <main className="auth-page">
        <form className="auth-form">
          <h1>邀请无效</h1>
          <p className="auth-closed-note">{error}</p>
        </form>
      </main>
    );
  const unusable =
    preview &&
    (!preview.usable
      ? preview.accepted
        ? "该邀请已被使用"
        : preview.revoked
          ? "该邀请已被撤销"
          : "该邀请已过期"
      : "");
  return (
    <main className="auth-page">
      <section className="auth-note">
        <span className="brand-mark">闲</span>
        <p>
          加入
          <br />
          {preview?.workspaceName}
        </p>
        <small>通过邀请链接注册或登录后加入工作区。</small>
      </section>
      <form className="auth-form" onSubmit={submit}>
        <div>
          <span className="eyebrow">WORKSPACE INVITE</span>
          <h1>接受邀请</h1>
          <p>
            邀请邮箱：<strong>{preview?.email}</strong>
            {preview?.role ? ` · 角色 ${preview.role}` : null}
          </p>
        </div>
        {unusable ? (
          <p className="auth-closed-note">{unusable}</p>
        ) : (
          <>
            <FieldGroup>
              {needsRegister ? (
                <Field>
                  <FieldLabel htmlFor="invite-name">你的名字</FieldLabel>
                  <Input
                    id="invite-name"
                    name="name"
                    required
                    maxLength={80}
                  />
                </Field>
              ) : (
                <Field>
                  <FieldLabel htmlFor="invite-email">邮箱</FieldLabel>
                  <Input
                    id="invite-email"
                    name="email"
                    type="email"
                    required
                    defaultValue={preview?.email}
                    autoComplete="email"
                  />
                </Field>
              )}
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="invite-password">
                  {needsRegister ? "设置密码" : "密码"}
                </FieldLabel>
                <Input
                  id="invite-password"
                  name="password"
                  type="password"
                  required
                  minLength={needsRegister ? 10 : 1}
                  autoComplete={
                    needsRegister ? "new-password" : "current-password"
                  }
                  aria-invalid={Boolean(error)}
                />
                {error ? <FieldError>{error}</FieldError> : null}
              </Field>
            </FieldGroup>
            <Button type="submit" size="lg" disabled={busy}>
              {busy
                ? "请稍候…"
                : needsRegister
                  ? "注册并加入"
                  : "登录并加入"}
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button
              type="button"
              variant="link"
              onClick={() => setNeedsRegister((current) => !current)}
            >
              {needsRegister
                ? "已有账号？登录后接受邀请"
                : "还没有账号？注册并加入"}
            </Button>
          </>
        )}
      </form>
    </main>
  );
}
