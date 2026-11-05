import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/lib/toast";
import type { AuthProvider } from "./auth-methods";
import type { AuthCaptcha } from "./use-auth-captcha";

type ProviderSignInOptions = {
  callbackURL: string;
  errorCallbackURL: string;
  captcha: AuthCaptcha;
  getName: (provider: AuthProvider) => string;
  onSuccess?: () => void;
};

export function useProviderSignIn({
  callbackURL,
  errorCallbackURL,
  captcha,
  getName,
  onSuccess,
}: ProviderSignInOptions) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<AuthProvider | null>(null);

  const signIn = useCallback(
    async (provider: AuthProvider) => {
      if (captcha.pending) return false;
      setPending(provider);
      const options = { headers: captcha.headers };
      try {
        const result =
          provider === "custom"
            ? await authClient.signIn.oauth2(
                { providerId: "custom", callbackURL, errorCallbackURL },
                options,
              )
            : await authClient.signIn.social(
                { provider, callbackURL, errorCallbackURL },
                options,
              );
        if (result.error) throw new Error(result.error.message);
        // Firebase completes the popup without a browser redirect. Clear the
        // pending state and let the caller move the SPA to its destination.
        // Leaving this pending was the cause of the permanent spinner shown
        // after a successful Google account selection.
        setPending(null);
        captcha.reset();
        onSuccess?.();
        return true;
      } catch (error) {
        toast.error(
          error instanceof Error && error.message
            ? error.message
            : t("auth:providers.error", { provider: getName(provider) }),
        );
        setPending(null);
        captcha.reset();
        return false;
      }
    },
    [callbackURL, errorCallbackURL, captcha, getName, onSuccess, t],
  );

  return { pending, signIn };
}
