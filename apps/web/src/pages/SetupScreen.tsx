import { FormEvent, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export default function SetupScreen({
  token,
  onReady,
}: {
  token: string;
  onReady: () => void;
}) {
  const [preview, setPreview] = useState<{
    email: string;
    name: string;
    expired: boolean;
    used: boolean;
    usable: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api
      .previewSetup(token)
      .then(setPreview)
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "链接无效"),
      );
  }, [token]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const password = String(
      new FormData(event.currentTarget).get("password"),
    );
    try {
      await api.completeSetup(token, password);
      onReady();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "设置失败");
    } finally {
      setBusy(false);
    }
  }
  if (!preview && !error)
    return <main className="boot">正在加载设置链接…</main>;
  if (error && !preview)
    return (
      <main className="auth-page">
        <form className="auth-form">
          <h1>链接无效</h1>
          <p className="auth-closed-note">{error}</p>
        </form>
      </main>
    );
  const unusable =
    preview &&
    (!preview.usable
      ? preview.used
        ? "该设置链接已被使用"
        : "该设置链接已过期"
      : "");
  return (
    <main className="auth-page">
      <section className="auth-note">
        <span className="brand-mark">闲</span>
        <p>
          设置账号
          <br />
          {preview?.name}
        </p>
        <small>管理员已为你创建账号，请设置登录密码。</small>
      </section>
      <form className="auth-form" onSubmit={submit}>
        <div>
          <span className="eyebrow">ACCOUNT SETUP</span>
          <h1>设置密码</h1>
          <p>
            账号邮箱：<strong>{preview?.email}</strong>
          </p>
        </div>
        {unusable ? (
          <p className="auth-closed-note">{unusable}</p>
        ) : (
          <>
            <FieldGroup>
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="setup-password">新密码</FieldLabel>
                <Input
                  id="setup-password"
                  name="password"
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  aria-invalid={Boolean(error)}
                />
                {error ? <FieldError>{error}</FieldError> : null}
              </Field>
            </FieldGroup>
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? "请稍候…" : "设置密码并登录"}
              <ArrowRight data-icon="inline-end" />
            </Button>
          </>
        )}
      </form>
    </main>
  );
}
