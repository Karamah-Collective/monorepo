import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProviderSignIn } from "./use-provider-sign-in";

const mocks = vi.hoisted(() => ({
  social: vi.fn(),
  oauth2: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      social: mocks.social,
      oauth2: mocks.oauth2,
    },
  },
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: mocks.toastError },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function options(onSuccess = vi.fn()) {
  return {
    callbackURL: "/dashboard",
    errorCallbackURL: "/auth/sign-in",
    captcha: {
      pending: false,
      headers: {},
      reset: vi.fn(),
    },
    getName: () => "Google",
    onSuccess,
  };
}

describe("useProviderSignIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears the spinner and calls the success callback after Firebase sign-in", async () => {
    mocks.social.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useProviderSignIn(options(onSuccess)));

    await act(async () => {
      await result.current.signIn("google");
    });

    expect(result.current.pending).toBeNull();
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("clears the spinner and shows an error when sign-in fails", async () => {
    mocks.social.mockResolvedValue({
      data: null,
      error: { message: "Firebase rejected the sign-in." },
    });
    const { result } = renderHook(() => useProviderSignIn(options()));

    await act(async () => {
      await result.current.signIn("google");
    });

    expect(result.current.pending).toBeNull();
    expect(mocks.toastError).toHaveBeenCalledWith("Firebase rejected the sign-in.");
  });
});
